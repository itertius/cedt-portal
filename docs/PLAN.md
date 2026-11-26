# CEDT Hub — Plan

See also [SOW](SOW.md) and [Wireframes](WIREFRAMES.md).

## Context

CEDT students juggle many separate platforms: MyCourseVille (MCV), Talent Journey, CEDT Intern Portal, Nisitez, CEDT Grader, CEDT-ICES, and others. Each one has its own login, notifications and deadlines. The goal is one web app with one login (Chula SSO or MCV) that collects every platform's data and actions, plus quality-of-life features: an AI assistant for schedule, calendar, notes and community. Phase 1 is personal use only. Public launch for CEDT comes later. Hosting starts on free tiers and moves to the CEDT Solution Club server later, so the stack must be portable (Docker, plain Postgres, no vendor lock-in).

- Domain: `witsanupong-kolakul.com`. Use the root for a portfolio/landing page and serve the app at `hub.witsanupong-kolakul.com`. That way the personal brand and the product stay separate, and the app can move to a CEDT domain later.
- Repo: `/Users/iterrius_te/Code/cedt-portal`. It is empty (README only), so this is a greenfield build.

## 1. Integration reality (most important constraint)

| Platform                       | Likely access                                        | Strategy                                                                                                       |
| ------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| MyCourseVille                  | Official OAuth2 + REST API (used in CEDT courses)    | **Login provider + API sync** (courses, assignments, announcements). Needs an MCV client_id from the CV team   |
| Chula SSO                      | Chula IT SSO, or Microsoft Entra (Chula M365 tenant) | **Login provider** via OIDC. Needs app registration or tenant consent from Chula IT. Until then, use MCV login |
| CEDT Grader                    | Web app, no public API                               | Deep link + browser-extension sync (problem list, scores)                                                      |
| Talent Journey / Intern Portal | Web app, no public API                               | Deep link + extension sync (applications, status). Use an iCal/email parse fallback where it exists            |
| Nisitez                        | Web app, no public API                               | Deep link + extension sync                                                                                     |
| CEDT-ICES                      | Web app (evaluations)                                | Deep link + "pending evaluation" reminder (extension or manual)                                                |
| Google Calendar / Outlook      | Official OAuth                                       | Two-way calendar sync                                                                                          |

Rules:

- Never store another platform's password.
- The browser extension reads only pages the user already opened while logged in and posts normalized JSON to the hub.
- Before the public launch, get written permission from CEDT/platform owners. That permission is the path to official APIs.

## 2. Tech stack

- **App**: Next.js (App Router) + TypeScript + React Server Components, Tailwind + shadcn/ui, TanStack Query for client state, next-intl (TH/EN).
- **Auth**: Better Auth (self-hostable, generic OAuth/OIDC providers): MCV OAuth2 provider, Chula OIDC provider, Google (for calendar scope). Session cookie on `.witsanupong-kolakul.com`.
- **DB**: PostgreSQL (Neon free → Solution Club Postgres), Drizzle ORM + drizzle-kit migrations, `pgvector` for note search/RAG.
- **Jobs**: one `/api/cron/sync` route called by Vercel Cron (phase 1). On self-host, a system cron or a `worker` container calls the same route. An `sync_jobs` table handles locking and retry.
- **Realtime (community)**: Postgres LISTEN/NOTIFY through SSE on self-host. Phase 1 uses polling, or the Supabase Realtime/Pusher free tier behind an interface.
- **AI**: Anthropic TypeScript SDK (`@anthropic-ai/sdk`), model `claude-opus-5-5`, adaptive thinking, effort `low` for chat and `medium` for planning, streaming, server-side `fallbacks: "default"`. Tool loop uses SDK Tool Runner (`client.beta.messages.toolRunner` + `betaZodTool`) because every tool is a call into our own DB/APIs and must run inside the request. (Alternative: Managed Agents, where Anthropic hosts the loop. It is beta and bills runtime. Not needed now.)
- **Extension**: Chrome MV3 (Plasmo or WXT), content scripts per platform, token-auth to hub API.
- **Infra**:
  - Phase 1: Vercel (app) + Neon (DB) + Cloudflare (DNS for the domain, R2 for file uploads).
  - Later: `docker-compose` (app, worker, postgres, caddy) on the Solution Club server.
- **Quality**: pnpm, Biome, Vitest, Playwright, GitHub Actions CI, Sentry free tier.
- **Repo layout** (pnpm monorepo, Turborepo):

  ```
  apps/web          Next.js hub
  apps/extension    browser sync extension
  packages/db       drizzle schema + migrations
  packages/connectors  one module per platform (MCV, grader, talent...)
  packages/ai       assistant tools + prompts
  packages/ui       shared components
  ```

## Architecture

```text
 Browser (hub.witsanupong-kolakul.com)        Chrome extension (MV3)
        │  HTTPS                                   │ POST /api/ingest/:connector
        ▼                                          ▼  (scoped user token)
 ┌──────────────────────── Next.js app (apps/web) ─────────────────────────┐
 │  UI (RSC + shadcn)   Auth (Better Auth)   API routes   /api/cron/sync   │
 │        │                   │                  │              │          │
 │        └──────── packages/connectors ─────────┴──── packages/ai ───────┘ │
 └──────────┬───────────────────┬───────────────────────────┬──────────────┘
            ▼                   ▼                           ▼
   PostgreSQL + pgvector   External APIs                Claude API
   (Neon → club server)    MCV · Chula OIDC · Google    (Tool Runner)
                           Deep links: Grader, Talent,
                           Intern, Nisitez, ICES
```

## 3. Core logic

**Connector interface** (every platform plugs into this):

```ts
interface Connector {
  id: "mcv" | "grader" | "talent" | "intern" | "nisitez" | "ices" | "gcal";
  kind: "api" | "extension" | "link";
  sync(userId): Promise<NormalizedItem[]>; // api connectors
  ingest(userId, payload): NormalizedItem[]; // extension connectors
  deepLink(item): string; // "open in platform"
}
```
**Normalized model**: every platform's data becomes one of these: `Course`, `Task` (assignment, grader problem, ICES eval, intern application step; has due_at, status, source, source_url), `Event`, `Announcement`, `Notification`. The dashboard and AI read only the normalized tables, never platform-specific ones.

**Main tables**:

- `users`, `accounts` (OAuth tokens, encrypted)
- `connections` (user × connector, status, last_sync)
- `courses`, `tasks`, `events`, `announcements`
- `notes` (markdown + embedding)
- `communities`, `posts`, `comments`, `reactions`
- `ai_threads`, `ai_messages`, `sync_jobs`, `audit_log`

**Flows**:

1. **Login**:
   1. The user clicks "Login with MCV" or "Login with Chula".
   2. The OAuth flow runs, then the user is upserted by Chula email/student ID.
   3. The provider token is stored encrypted, and the MCV connection is auto-created.
2. **Sync**:
   1. Cron runs every 15 min and on demand.
   2. For each active connection, it calls `connector.sync()`.
   3. Results go through normalize, then an upsert keyed on `(source, source_id)`.
   4. New or changed items create a notification.
   5. The extension posts `/api/ingest/:connector` with a per-user token. The payload is checked against a zod schema, then follows the same upsert path.
3. **Unified calendar**: tasks + events + class timetable (MCV) + Google Calendar, with two-way sync to Google for hub-created events.
4. **AI assistant**:
   - Chat with tools: `list_tasks`, `list_events`, `find_free_slots`, `create_event`, `create_task`, `plan_study_blocks`, `search_notes`, `summarize_announcements`, `draft_post`.
   - Write tools return a preview and need a user confirm click before commit.
   - Daily briefing (cron): "today/this week" summary of deadlines.
5. **Notes**:
   - Markdown editor (TipTap). Notes can attach to a course or task.
   - Embedded with pgvector so search and "ask my notes" (RAG) work.
6. **Community**:
   - Per-course / per-cohort boards, Q&A posts, study-group events, reactions, reports.
   - Disabled or self-only in phase 1. Enabled at launch with moderation.

**Security**:

- OAuth tokens are encrypted with AES-GCM; the key comes from env.
- Row-level ownership checks go in every query helper.
- The extension token is scoped and revocable.
- Rate limits apply.
- PDPA consent page before public launch.

## 6. First implementation steps (after approval)

1. Write this plan to `docs/PLAN.md`, `docs/SOW.md`, `docs/WIREFRAMES.md` in the repo, and keep docs as Markdown only (no hosted pages).
2. Scaffold Phase 0:
   1. `pnpm` + Turborepo with `apps/web` and `packages/db`.
   2. Drizzle schema for `users`/`accounts`/`connections`/`tasks`.
   3. Better Auth with a generic OAuth provider for MCV.
   4. `.env.example`, `docker-compose.yml` (postgres for local), and CI.

## Verification

- `pnpm dev`, then log in through MCV (with a sandbox client id) and see your own courses/assignments on the dashboard.
- `pnpm test` runs Vitest connector normalizers against fixtures. `pnpm e2e` runs Playwright: login stub, dashboard render, task deep link.
- `docker compose up` runs the full stack locally, which proves portability to the club server.
- Deploy a Vercel preview, point the `hub.` CNAME at it, check HTTPS and the OAuth callback on the real domain.
