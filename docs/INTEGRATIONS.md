# Platform integrations — research and decisions

Researched 2026-11-27 from public GitHub projects and one unauthenticated request to each
platform's public pages and APIs. No accounts were used and nothing was scraped behind a login.
Where a platform was only probed, this says so.

## The headline: CEDT IDP

`cedtintern.cp.eng.chula.ac.th` is not only the Intern Portal. It is also **"CEDT IDP"**, an
OAuth 2.0 identity provider for CEDT students. Three platforms already log in through it:

| Platform                                                                                                    | Login seen on its public page or JS                                         |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| CEDT Intern Portal                                                                                          | is the IdP (also offers "เข้าสู่ระบบด้วยบัญชี myCourseVille")                     |
| Talent Journey                                                                                              | `cedtintern.cp.eng.chula.ac.th/oauth/authorize?…`, `/api/v2/auth/login/idp` |
| Nisitez                                                                                                     | `/api/auth/cedt` (plus Google)                                              |
| Friday Activity ([prame-dot-exe/Friday-Act-Frontend](https://github.com/prame-dot-exe/Friday-Act-Frontend)) | registered client `cedt-friday-activity`                                    |

Endpoints, from Friday Activity's open-source code:

| Step        | Endpoint                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Authorize   | `GET https://cedtintern.cp.eng.chula.ac.th/oauth/authorize?client_id&redirect_uri&scope&response_type=code&state`                |
| Token       | `POST https://cedtintern.cp.eng.chula.ac.th/api/oauth/token` (form; `authorization_code`, `refresh_token`, `client_credentials`) |
| Profile     | `GET https://cedtintern.cp.eng.chula.ac.th/api/oauth/v1/profile` (Bearer)                                                        |
| Scopes seen | `profile`, `student_contact_info`, `student_academic_badge`, `student_activity_badge`                                            |

The profile is far richer than MyCourseVille's: `studentId`, Thai and English names,
`admissionYear`, program, department, faculty, profile photo, `userType: CEDT_STUDENT`. Access
tokens last 24 h and come with a refresh token. The issuer is `CEDT IDP`.

**Decision:** request an OAuth client for CEDT Hub from the CEDT IDP / Intern Portal team.
"Log in with CEDT" then becomes the primary login: real student identity, no placeholder email,
and it is the same account Talent Journey and Nisitez already use. MCV OAuth stays for MCV data.
Better Auth's generic OAuth provider fits as-is, the same way MCV is wired today.

## Method ranking (what we allow)

| Rank | Method                                                                             | Allowed?                               |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| 1    | Official OAuth or API with our own client                                          | ✅ Preferred                           |
| 2    | Public, unauthenticated endpoint the site itself uses                              | ✅ Cache it, poll politely             |
| 3    | Token the user hands us (pasted, or exchanged once from a password we never store) | ✅ Encrypted, revocable, clear consent |
| 4    | Browser extension reading pages and APIs of a session the user already has open    | ✅ Phase 4                             |
| 5    | Storing a user's password and logging in headlessly for them                       | ❌ Never                               |

Rank 5 is what [campksk/cedt-intern-sorting](https://github.com/campksk/cedt-intern-sorting)
does: Playwright logs into MyCourseVille with a stored username and password. It works, but it
keeps a Chula password on a server and can lock the account. CEDT Hub will not do this.

## Per platform

### MyCourseVille

- **Status:** ✅ official OAuth, built (Phase 0–1).
- **Endpoints confirmed on GitHub:** `users/me`, `get/user/info`, `get/user/courses?detail=1`,
  `get/course/assignments?cv_cid=&detail=1`.
- **Announcements:** no public API endpoint appears in any public project. They stay out of
  Phase 1 until MCV documents one or the extension (rank 4) reads them.
- **Not used:** [CEDT-Chula/mcv-api-python-unofficial](https://github.com/CEDT-Chula/mcv-api-python-unofficial)
  reverse-engineers the Laravel session (`laravel_session`, `XSRF-TOKEN`, a `SESS…` cookie) and
  needs the user's password, so it is rank 5.

### CEDT Intern Portal (`cedtintern.cp.eng.chula.ac.th`)

- **Data API (seen in the code of several projects):**
  - `GET /api/common/sessions` lists the internship pools.
  - `GET /api/sessions/{id}/openings?search=&page=&limit=&onlyBookmarked=&onlyAvailablePositions=`
    lists openings with company, tags, compensation, working condition, dates, quota and
    `isBookmarked`, paged with `meta.totalPage` and `meta.totalItem`.
  - Both return `401 {"message":"Unauthorized"}` without a session (probed).
- **How others get in:**
  - [sayhi7562/CEDT-Internship-Explorer](https://github.com/sayhi7562/CEDT-Internship-Explorer):
    the user pastes their browser `Cookie` header, the server forwards it, and it is not stored
    (rank 3).
  - [CEDT-Chula/cedt-intern-compensation-sorting-scraper](https://github.com/CEDT-Chula/cedt-intern-compensation-sorting-scraper)
    (Rust) and others: the same API with a cookie.
  - [campksk/cedt-intern-sorting](https://github.com/campksk/cedt-intern-sorting): headless login
    with a stored MCV password (rank 5, rejected).
- **Plan:**
  1. Now: a "Connect Intern Portal" setting where the user pastes their cookie (rank 3), stored
     encrypted with an expiry. Sync pools, openings and bookmarks into a new `internship` table.
     Bookmarked openings with dates become tasks and events.
  2. Phase 4: the extension captures the session automatically, with no pasting.
  3. Ask the IdP team whether a CEDT IDP token for our client can read openings, which would
     make it rank 1.

### CEDT Grader (`cedt-grader.nattee.net`, cafe-grader)

- **It is [cafe-grader-web](https://github.com/cafe-grader-team/cafe-grader-web)**, open-source
  Rails, which now has a **JSON API under `/api/v1` with JWT bearer auth**. It is live on the
  CEDT server: `/api/v1/me` answers `401 {"error":"Missing authorization token"}` (probed).
- **Routes** (from `config/routes.rb`): `POST auth/login {login,password}` → `{token}`, `GET me`,
  `GET problems`, `GET problems/:id`, `GET contests/:id/problems`,
  `GET|POST problems/:id/submissions`.
- **How others get in:** [Badvoic3/grader-submit](https://github.com/Badvoic3/grader-submit)
  (VS Code extension on the Marketplace) uses exactly this JSON API with username and password
  to get a JWT. Older tools such as [CEDT-Chula/nattee_scraper](https://github.com/CEDT-Chula/nattee_scraper)
  post the HTML login form with the Rails `authenticity_token` and scrape HTML.
- **Plan (rank 3):** "Connect Grader" asks for the grader username and password **once**, calls
  `POST /api/v1/auth/login` server-side, and **stores only the JWT** (encrypted). The password is
  never written anywhere. When the JWT expires the user is asked again.
  - Sync problems and the user's submissions and scores into tasks: open or unsolved problems,
    with contest deadlines where the API exposes them.
  - Never retry failed logins: cafe-grader throttles them, as the extension notes.
- **Ask:** whether the grader admins (อ.ณัฐธี / cafe-grader team) would issue API tokens or allow
  CEDT IDP login. That would make it rank 1.

### Talent Journey (`talent.cedt.community`)

- **Login:** CEDT IDP (`/api/v2/auth/login/idp`, `/api/v2/auth/refresh`).
- **Public data (probed, no login):** `GET /api/v2/home/bootstrap` returns upcoming
  **activities** (`activityId, name, date, startTime, endTime, organization, maxParticipants,
  currentParticipants, activityStatus, posterUrl`), plus recruiting clubs and sponsors.
- **Plan:** (rank 2, **can build now**) a connector that reads the public bootstrap about once an
  hour, cached, and shows Talent Journey activities on the hub calendar as read-only events with
  a link back.
  - Personal data (`/api/v2/applications`) needs the user's Talent Journey session. That comes
    via the Phase 4 extension, or via CEDT IDP if the Talent Journey team agrees.

### Nisitez (`nisitez.siamcodex.com`)

- **Login:** CEDT IDP (`/api/auth/cedt`) or Google. Built with Next.js.
- **No public projects or APIs found.**
- **Plan:** launcher link now; extension (rank 4) in Phase 4 after looking at what data exists.
  Ask its developers (siamcodex) directly, since it is a small student-run product.

### CEDT-ICES (`cedt-ices.com`)

- **Login:** MyCourseVille (`/api/v1/auth/mcv/login`). Built with Next.js.
- **No public projects found.**
- **Plan:** launcher link now; extension (rank 4) in Phase 4 to read pending evaluations and
  their deadlines as tasks.

## Summary

| Platform                  | Best method                                                 | Rank      | When                                                     |
| ------------------------- | ----------------------------------------------------------- | --------- | -------------------------------------------------------- |
| Hub login                 | **CEDT IDP OAuth** (ask for a client)                       | 1         | As soon as the client is granted                         |
| MyCourseVille             | Official OAuth + public API                                 | 1         | Built                                                    |
| Talent Journey activities | Public `/api/v2/home/bootstrap`                             | 2         | **Built** (Phase 1.5)                                    |
| Intern Portal             | Cookie paste → extension → IDP token                        | 3 → 4 → 1 | **Cookie paste built** (Phase 1.5); extension in Phase 4 |
| Grader                    | `/api/v1` JWT from a one-time login (password never stored) | 3         | **Built** (Phase 1.5)                                    |
| Nisitez                   | Extension, or ask the developers                            | 4         | Phase 4                                                  |
| CEDT-ICES                 | Extension                                                   | 4         | Phase 4                                                  |

## Emails to send

1. **CEDT IDP / Intern Portal team:**
   - Ask for an OAuth client for CEDT Hub (redirect URIs on `hub.` and `dev.hub.witsanupong-kolakul.com`).
   - Ask which scopes we may use.
   - Ask whether an IDP token can read Intern Portal openings and bookmarks.
2. **MyCourseVille team:** the MCV OAuth client (already pending), and whether an announcements
   endpoint exists.
3. **Grader admins:** whether API tokens or IdP login are possible, and an acceptable request rate.
4. **Talent Journey, Nisitez, ICES teams:** a note that CEDT Hub links to them and reads Talent
   Journey's public activities, and whether they would like an official integration.

## Rules every connector follows

- Every sync goes through the server, rate-limited, with at most one request per resource per
  sync. Responses are cached. `User-Agent: CEDT-Hub` (no personal data in it).
- Tokens and cookies are encrypted at rest, can be revoked in Settings, and are deleted on
  disconnect. Passwords are never stored.
- A connector stops and asks the user to reconnect on 401. It never retries a login on its own.
- Each connector gets a mock server and Playwright coverage in its phase spec
  ([TESTING.md](TESTING.md)).
