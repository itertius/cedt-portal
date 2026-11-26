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

Requirements: Node 22+ and pnpm 10 (`npm i -g pnpm` or `corepack enable`).

```sh
cp .env.example apps/web/.env.local
pnpm install
pnpm dev        # http://localhost:3000
```

## Rules

- Never commit secrets, tokens or real student data. Use `.env.local`.
- Never add code that stores passwords for other platforms or scrapes them server-side (see the
  integration rules in docs/PLAN.md).
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
