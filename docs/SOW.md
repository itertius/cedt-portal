# CEDT Hub — Statement of Work

## 5. SOW (solo dev, personal phase → launch)

| Phase                      | Scope / deliverables                                                                                                                              | Acceptance                                           | Est.   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| **0 Setup**                | Monorepo, CI, Neon, Vercel, Cloudflare DNS `hub.` subdomain, Better Auth with MCV login, base layout                                              | Can log in with MCV on `hub.witsanupong-kolakul.com` | 1 wk   |
| **1 MVP aggregator**       | MCV connector (courses/assignments/announcements), normalized tables, dashboard, tasks, app launcher (deep links), cron sync                      | MCV data appears in under 15 min, deep links work    | 2–3 wk |
| **2 Calendar + Notes**     | Unified calendar, Google Calendar 2-way sync, notes editor + course linking                                                                       | Events appear in Google Calendar; notes CRUD         | 2 wk   |
| **3 AI assistant**         | Tool-runner chat, confirm cards, daily briefing, note RAG, usage cap per user                                                                     | "Plan my week" creates confirmed events; cost log    | 2 wk   |
| **4 Extension connectors** | MV3 extension + Grader, Talent Journey, Intern Portal, Nisitez, ICES ingesters                                                                    | Visiting the platform updates hub tasks              | 2–3 wk |
| **5 Community**            | Boards, posts, comments, study groups, reporting, moderation                                                                                      | Multi-user test with friends                         | 2 wk   |
| **6 Launch prep**          | Chula SSO (after IT approval), PDPA/consent, ToS, permissions from CEDT, migrate to Solution Club server with docker-compose, backups, monitoring | Runs on club server, restore drill passes            | 2 wk   |

**Out of scope (for now)**: native mobile app (use PWA instead), storing third-party passwords, server-side scraping, writing back into platforms without official APIs, payments.
**Dependencies/risks**:

- MCV client registration.
- Chula IT SSO approval.
- Platform HTML changes break extension parsers. Mitigation: per-connector parser tests with saved fixtures.
- AI cost. Mitigation: per-user monthly cap and low effort for chat.
- Platform ToS. Mitigation: get permission before launch.
