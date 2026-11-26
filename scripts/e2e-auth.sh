#!/usr/bin/env bash
# End-to-end MCV login test against the mock MCV server.
# Needs: a migrated Postgres at $DATABASE_URL and a built app (pnpm build).
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${E2E_PORT:-3100}
BASE="http://localhost:$PORT"
JAR=$(mktemp)
export BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-$(openssl rand -base64 32)}
export BETTER_AUTH_URL=$BASE MCV_CLIENT_ID=e2e MCV_CLIENT_SECRET=e2e MCV_BASE_URL=http://localhost:4010 CRON_SECRET=e2e-cron
: "${DATABASE_URL:?DATABASE_URL must point at a migrated database}"

node apps/web/scripts/mock-mcv.mjs >/dev/null & MOCK=$!
(cd apps/web && exec ./node_modules/.bin/next start -p "$PORT") >/dev/null 2>&1 & APP=$!
trap 'kill $MOCK $APP 2>/dev/null || true; rm -f "$JAR"' EXIT

for _ in $(seq 1 60); do curl -sf "$BASE/api/health" >/dev/null && break; sleep 1; done

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok - $*"; }

curl -s "$BASE/" | grep -q 'href="/login"' || fail "logged-out home has no login link"
pass "logged-out home"

SIGNIN=$(curl -s -c "$JAR" -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -X POST "$BASE/api/auth/sign-in/social" -d '{"provider":"mcv","callbackURL":"/"}')
AUTH_URL=$(node -pe 'JSON.parse(process.argv[1]).url ?? ""' "$SIGNIN")
[[ $AUTH_URL == http://localhost:4010/api/oauth/authorize* ]] || fail "unexpected sign-in response: $SIGNIN"
[[ $AUTH_URL == *"redirect_uri=http%3A%2F%2Flocalhost%3A$PORT%2Fapi%2Fauth%2Fcallback%2Fmcv"* ]] || fail "bad redirect_uri"
pass "sign-in redirects to MCV with the right callback"

CALLBACK=$(curl -s -o /dev/null -w '%{redirect_url}' "$AUTH_URL")
RESULT=$(curl -s -o /dev/null -c "$JAR" -b "$JAR" -w '%{http_code} %{redirect_url}' "$CALLBACK")
[[ $RESULT == "302 $BASE/" ]] || fail "callback returned: $RESULT"
pass "callback signs in and redirects home"

SESSION=$(curl -s -b "$JAR" "$BASE/api/auth/get-session")
[[ $SESSION == *'"name":"Test Student"'* && $SESSION == *'mcv-6530000021@mcv.invalid'* ]] || fail "session: $SESSION"
pass "session has the MCV profile"

curl -s -b "$JAR" "$BASE/" | grep -q 'Hi, <!-- -->Test Student' || fail "dashboard does not greet the user"
pass "logged-in dashboard"

# The first dashboard view starts a background MCV sync; wait for it to land.
for _ in $(seq 1 20); do
  HOME_HTML=$(curl -s -b "$JAR" "$BASE/")
  grep -q 'Lab 5: OAuth' <<<"$HOME_HTML" && break
  sleep 1
done
grep -q 'Lab 5: OAuth' <<<"$HOME_HTML" || fail "synced assignment missing from dashboard"
grep -q 'Problem set 3' <<<"$HOME_HTML" || fail "second course assignment missing"
grep -q 'Overdue' <<<"$HOME_HTML" && grep -q 'Project proposal' <<<"$HOME_HTML" || fail "overdue section missing"
grep -q 'Reading: series' <<<"$HOME_HTML" || fail "undated task missing"
grep -q 'Old term HW' <<<"$HOME_HTML" && fail "old-term assignment should not be synced"
grep -q 'Computer Engineering Essentials' <<<"$HOME_HTML" || fail "current course missing"
grep -q 'courseville/worksheet/1001/50001' <<<"$HOME_HTML" || fail "assignment deep link missing"
pass "background sync fills the dashboard"

[[ $(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cron/sync") == 401 ]] || fail "cron without secret"
CRON=$(curl -s -H 'Authorization: Bearer e2e-cron' "$BASE/api/cron/sync")
[[ $CRON == *'"users":'* && $CRON != *'"error":1'* ]] || fail "cron: $CRON"
pass "cron endpoint is protected and runs ($CRON)"

curl -s -o /dev/null -b "$JAR" -c "$JAR" -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -X POST "$BASE/api/auth/sign-out" -d '{}'
[[ $(curl -s -b "$JAR" "$BASE/api/auth/get-session") == "null" ]] || fail "still signed in after sign-out"
pass "sign-out"
