# CEDT Hub — Wireframes

## 4. Wireframes

**Dashboard (`/`)**

```
┌ CEDT Hub ─────────────── [⌘K search] [🔔3] [avatar] ┐
│ Sidebar        │ Good morning, Witsanupong             │
│ ▸ Dashboard    │ ┌ Today ───────────┐ ┌ AI briefing ──┐ │
│ ▸ Calendar     │ │ 09:00 Class X    │ │ 3 due this wk │ │
│ ▸ Tasks        │ │ 13:00 Study blk  │ │ Grader P5 low │ │
│ ▸ Courses      │ └──────────────────┘ │ [Plan my week]│ │
│ ▸ Notes        │ ┌ Due soon (all platforms) ────────┐ │
│ ▸ Community    │ │ [MCV] HW3      Fri 23:59  ●      │ │
│ ▸ Apps ↗       │ │ [Grader] P5    Sat         ●     │ │
│   MCV, Grader, │ │ [ICES] Eval    Sun   [Open ↗]    │ │
│   Talent, ...  │ └──────────────────────────────────┘ │
│ ▸ Settings     │ ┌ Announcements ┐ ┌ Platform status ┐ │
│                │ │ MCV: ...      │ │ MCV ✓ 2m ago    │ │
│ [💬 Ask AI]    │ └───────────────┘ │ Grader ⚠ ext    │ │
└────────────────┴───────────────────┴─────────────────┘
```
**Calendar (`/calendar`)**: week/month toggle, color by source, drag to reschedule hub events, side panel "AI: find 2h slot for HW3".
**Tasks (`/tasks`)**: kanban/list, filter by source/course/due, each row has "Open in platform ↗".
**Notes (`/notes`)**: 3-pane (tree | editor | AI side: summarize / quiz me / ask).
**Community (`/c/:course`)**: feed + "Ask question" + study groups.
**AI panel**: slide-over chat on every page. Tool actions render as confirm cards ("Create event 'HW3 study' Thu 19:00–21:00? [Confirm] [Edit]").
**Settings → Connections**: card per platform (status, last sync, connect/disconnect, "install extension" CTA).
