# Contributing to CEDT Hub

Thanks for helping! Read [docs/PLAN.md](docs/PLAN.md) first for the architecture and roadmap.

## Branch model

```
feature/*, fix/*, chore/*  ──PR──▶  dev  ──PR──▶  master
   (Vercel preview per PR)   (staging)         (production)
```

| Branch                          | Deploys to                              | Rules                                                  |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `master`                        | https://hub.witsanupong-kolakul.com     | Protected. PRs only from `dev` (release) or `hotfix/*` |
| `dev`                           | https://dev.hub.witsanupong-kolakul.com | Protected. All feature PRs target `dev`                |
| `feature/*`, `fix/*`, `chore/*` | Vercel preview URL on the PR            | Branch from `dev`                                      |

Both protected branches need a green `ci` check. Nobody pushes to them directly.

## Workflow

1. Fork the repo (maintainers can branch directly), then branch from `dev`:
   `git checkout dev && git pull && git checkout -b feature/short-name`
2. Make the change. Run the checks:

   ```sh
   pnpm install
   pnpm lint && pnpm typecheck && pnpm build
   ```
3. Open a PR into **`dev`**. Fill in the template and check the Vercel preview.
4. Feature PRs are squash-merged into `dev`.
5. Releases: a maintainer opens `dev` → `master` and merges it with a merge commit.

If you are not sure a change works, keep it on its own branch and open the PR as a draft.

## Local setup

Requirements: Node 22+, pnpm 10 (`npm i -g pnpm` or `corepack enable`) and Docker.

```sh
cp .env.example apps/web/.env.local   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d                  # Postgres; use POSTGRES_PORT=5433 if 5432 is taken
pnpm install
pnpm db:migrate
pnpm dev                              # http://localhost:3000
```

### Logging in without real MyCourseVille credentials

Run the mock MCV server and point the app at it:

```sh
node apps/web/scripts/mock-mcv.mjs    # http://localhost:4010
```

In `apps/web/.env.local` set `MCV_BASE_URL=http://localhost:4010` and any non-empty
`MCV_CLIENT_ID` / `MCV_CLIENT_SECRET`. "Log in with MyCourseVille" then signs you in as a fake
student.

### Google Calendar without a Google account

```sh
node apps/web/scripts/mock-google.mjs   # http://localhost:4020
```

Set `GOOGLE_BASE_URL=http://localhost:4020` and any non-empty `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`, then use Settings → Connect Google Calendar.

### Tests

See [docs/TESTING.md](docs/TESTING.md). Short version:

```sh
npx -y pnpm@10 e2e:install   # once: Playwright's Chromium
pnpm test                    # unit + database tests (needs DATABASE_URL)
pnpm build && pnpm e2e       # Playwright, one spec per phase (wipes the test database first)
```

**Every feature PR adds or updates tests**, and a phase only counts as done when its Playwright
spec passes in CI.

### Database changes

Edit `packages/db/src/schema.ts`, then run `pnpm db:generate` and commit the new file in
`packages/db/migrations`. CI fails if the schema and migrations drift.

## Rules

- Never commit secrets, tokens or real student data. Use `.env.local`.
- Never add code that stores passwords for other platforms or scrapes them server-side (see the
  integration rules in docs/PLAN.md).
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
