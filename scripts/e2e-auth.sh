#!/usr/bin/env bash
# End-to-end MCV login test against the mock MCV server.
# Needs: a migrated Postgres at $DATABASE_URL and a built app (pnpm build).
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${E2E_PORT:-3100}
BASE="http://localhost:$PORT"
JAR=$(mktemp)
export BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-$(openssl rand -base64 32)}
export BETTER_AUTH_URL=$BASE MCV_CLIENT_ID=e2e MCV_CLIENT_SECRET=e2e MCV_BASE_URL=http://localhost:4010
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

curl -s -b "$JAR" "$BASE/" | grep -q 'Logged in as <strong>Test Student' || fail "home does not show the user"
pass "logged-in home"

curl -s -o /dev/null -b "$JAR" -c "$JAR" -H "Origin: $BASE" -H 'Content-Type: application/json' \
  -X POST "$BASE/api/auth/sign-out" -d '{}'
[[ $(curl -s -b "$JAR" "$BASE/api/auth/get-session") == "null" ]] || fail "still signed in after sign-out"
pass "sign-out"
