# Testing

Every change is proven by three layers of tests. All of them run in CI (`ci` job) on every pull
request to `dev` or `master`, and a PR cannot merge unless they pass.

| Layer      | Tool                   | Where                                                       | What it covers                                              |
| ---------- | ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Unit       | Vitest                 | `packages/*/src/**/*.test.ts`, `apps/web/lib/**/*.test.ts`  | Pure logic: normalizers, date math, parsing, validation     |
| Database   | Vitest + real Postgres | `apps/web/lib/**/*.db.test.ts` and DB blocks in `*.test.ts` | Queries, upserts, sync rules, ownership between users       |
| End-to-end | Playwright (Chromium)  | `e2e/tests/phaseN-*.spec.ts`                                | The real app in a real browser, one spec file per SOW phase |

External services are never called in tests. The app talks to local mocks instead:

| Mock           | File                                 | Replaces                                                                                                               |
| -------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| MyCourseVille  | `apps/web/scripts/mock-mcv.mjs`      | OAuth, profile, courses, assignments                                                                                   |
| Google         | `apps/web/scripts/mock-google.mjs`   | OAuth (with PKCE), userinfo, Calendar v3, plus `__test` hooks to simulate edits made in Google                         |
| Talent Journey | `apps/web/scripts/mock-talent.mjs`   | public `/api/v2/home/bootstrap` feed, plus a `__test` hook to replace it                                               |
| CEDT Grader    | `apps/web/scripts/mock-grader.mjs`   | cafe-grader `/api/v1` (JWT login, problems), failed-login throttling, `__test` hooks to expire tokens and count logins |
| Intern Portal  | `apps/web/scripts/mock-intern.mjs`   | sessions with deadlines, paged openings, cookie check, `__test` hooks to expire/restore the session                    |
| CEDT IDP       | `apps/web/scripts/mock-cedt-idp.mjs` | OAuth authorize/token/profile at the IdP paths, `__test` hook to choose which student logs in                          |

## Phase gate (Definition of Done)

**A phase is complete only when its Playwright spec exists, covers every acceptance item of that
phase in [SOW.md](SOW.md), and passes in CI together with all earlier phases' specs.**

When a phase is finished:

1. Write or extend `e2e/tests/phaseN-<name>.spec.ts`, with one `test()` per acceptance item. Use
   the mocks for any external platform.
2. Add unit and database tests for the phase's logic (anything with rules, dates, ownership or
   sync).
3. Run the full suite locally (below) and in CI. Every earlier phase must still pass, because the
   suite is cumulative and doubles as a regression test.
4. Mark the phase **Done** in [SOW.md](SOW.md) with the name of its spec file.

Tests that need a real third-party account (real MCV, real Google) are a manual check before a
production release. They are listed under "Manual release checks" below and never replace the
automated gate.

## Current coverage

| Phase               | Spec                        | Covers                                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Setup             | `phase0-foundation.spec.ts` | health, logged-out home + icon, protected pages redirect, MCV login and logout, cron secret                                                                                                                                                                                     |
| 1 MVP aggregator    | `phase1-mcv.spec.ts`        | background MCV sync fills the dashboard (overdue, due soon, undated; current term only), MCV deep links, mark done survives a sync, Sync now, launcher links for all 6 platforms, cron sync                                                                                     |
| 1.5 More connectors | `phase1_5-cedt-idp.spec.ts` | login page puts CEDT first, new student signs up with real name + `@student.chula.ac.th` (unverified), **sign-in rate limit returns 429**, an MCV user links CEDT in Settings and a CEDT-only login then opens the same hub                                                     |
|                     | `phase1_5-grader.spec.ts`   | wrong password shows the grader's error and is not retried, connect syncs problems, dashboard progress + deep links, **password stored in no database column (all text columns checked) and token encrypted**, expired token asks to reconnect, disconnect wipes token and data |
|                     | `phase1_5-intern.spec.ts`   | rejected cookie refused, cookie stored encrypted, openings sorted by pay with bookmark/search/working-condition filters and portal links, bookmarks + ranking deadline on the dashboard, expired session asks for a fresh cookie, disconnect wipes everything                   |
|                     | `phase1_5-talent.spec.ts`   | cron pulls the public Talent Journey feed, dashboard activities card (participants), calendar at Bangkok times linking to Talent Journey, cancelled activity removed                                                                                                            |
| 2 Calendar + Notes  | `phase2-calendar.spec.ts`   | MCV deadlines on week view, month navigation, validation message, create/edit/delete in Bangkok time, multi-day all-day events, **form works without JavaScript**                                                                                                               |
|                     | `phase2-gcal.spec.ts`       | connect Google (keeps MCV login), pull read-only events, push without duplicates, edits and deletes in both directions, disconnect                                                                                                                                              |
|                     | `phase2-notes.spec.ts`      | autosave survives reload, Markdown preview, **XSS: scripts never run, `javascript:` links stripped**, Thai substring search, course filter, pinning, note from an event, delete                                                                                                 |

## Running the tests

```sh
# once
npx -y pnpm@10 install
npx -y pnpm@10 e2e:install                     # downloads Chromium for Playwright

# database for tests (Docker)
docker compose down -v && POSTGRES_PORT=5433 docker compose up -d --wait
export DATABASE_URL=postgres://cedt@localhost:5433/cedt_hub
npx -y pnpm@10 db:migrate

npx -y pnpm@10 test                            # unit + database tests
npx -y pnpm@10 build && npx -y pnpm@10 e2e     # Playwright (starts both mocks and the app itself)
npx -y pnpm@10 --filter @cedt-hub/e2e report   # open the HTML report (traces, screenshots, video)
```

- The Playwright run **empties the database first** (it truncates every table), so point
  `DATABASE_URL` at the test database, never at Neon.
- It uses its own ports (app 3300, mock MCV 4310, mock Google 4320), so it can run while
  `pnpm dev` is open.
- Run one phase: `npx -y pnpm@10 --filter @cedt-hub/e2e exec playwright test phase2-notes`.
- Watch it in a browser: add `--headed` or `--ui`.
- On a CI failure, download the **playwright-report** artifact from the run. It holds traces,
  screenshots and videos of the failing tests.

## Writing tests that stay reliable

- Wait for the page you expect before acting (for example `openEvent()` waits for "Edit event"),
  never for a fixed time.
- Select by role and label (`getByRole`, `getByLabel`), the way a user finds things. Scope to a
  section when a word appears twice.
- Work done in the background (`after()` syncs) is checked with `expect.poll` or `eventually()`.
- Use unique titles prefixed `PW` so tests in one run never collide.

## Manual release checks (before `dev` → `master`)

- [ ] Log in with real MyCourseVille on `dev.hub` (once the MCV client exists); assignments match MCV.
- [ ] Open one synced assignment link; it lands on the right MCV page.
- [ ] Connect real Google on `dev.hub`; a hub event appears in Google Calendar and a Google event appears in the hub.
- [ ] Migrations ran on the production Neon database before the release merge.
