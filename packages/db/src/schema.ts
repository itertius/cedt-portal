import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---- Better Auth core tables -------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Encrypted by Better Auth (account.encryptOAuthTokens).
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [
    index("account_user_id_idx").on(t.userId),
    uniqueIndex("account_provider_account_idx").on(t.providerId, t.accountId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---- Normalized platform data -------------------------------------------------
// Every connector (MCV today; Grader, Talent Journey, ... later) writes into these
// tables. The dashboard and AI read only from here, never from platform APIs.

export const sourceEnum = pgEnum("source", [
  "mcv",
  "hub",
  "grader",
  "talent",
  "intern",
  "nisitez",
  "ices",
  "gcal",
]);

export const syncStatusEnum = pgEnum("sync_status", ["idle", "running", "error"]);

export const course = pgTable(
  "course",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: sourceEnum("source").notNull(),
    sourceId: text("source_id").notNull(),
    code: text("code"),
    title: text("title").notNull(),
    year: integer("year"),
    semester: integer("semester"),
    role: text("role"),
    url: text("url"),
    ...timestamps,
  },
  (t) => [uniqueIndex("course_user_source_idx").on(t.userId, t.source, t.sourceId)],
);

export const task = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: sourceEnum("source").notNull(),
    sourceId: text("source_id").notNull(),
    courseId: uuid("course_id").references(() => course.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    url: text("url"),
    // Owned by the user, never overwritten by a sync.
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("task_user_source_idx").on(t.userId, t.source, t.sourceId),
    index("task_user_due_idx").on(t.userId, t.dueAt),
  ],
);

/** Calendar events: created in the hub (source "hub") or pulled from a calendar (e.g. "gcal"). */
export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // No DB default: Postgres cannot use a just-added enum value in the same migration.
    source: sourceEnum("source").notNull(),
    /** Id in the source system; null for hub-created events. */
    sourceId: text("source_id"),
    courseId: uuid("course_id").references(() => course.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    url: text("url"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("event_user_source_idx").on(t.userId, t.source, t.sourceId),
    index("event_user_starts_idx").on(t.userId, t.startsAt),
  ],
);

export const syncState = pgTable(
  "sync_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: sourceEnum("source").notNull(),
    status: syncStatusEnum("status").notNull().default("idle"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.source] })],
);
