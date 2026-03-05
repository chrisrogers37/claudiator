import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  jsonb,
  integer,
  smallint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  githubId: integer("github_id").notNull().unique(),
  githubUsername: text("github_username").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Admins ─────────────────────────────────────────────────────────────────

export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedBy: uuid("granted_by").references(() => users.id, {
    onDelete: "set null",
  }),
  grantedAt: timestamp("granted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── API Tokens ──────────────────────────────────────────────────────────────

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(), // first 8 chars for display: "cf_abc12..."
    name: text("name").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    totalCalls: integer("total_calls").notNull().default(0),
    successfulCalls: integer("successful_calls").notNull().default(0),
    failedCalls: integer("failed_calls").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_tokens_user_id_idx").on(table.userId),
    index("api_tokens_token_prefix_idx").on(table.tokenPrefix),
  ]
);

// ─── Skills ──────────────────────────────────────────────────────────────────

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(), // directory name, e.g. "quick-commit"
    name: text("name").notNull(), // from SKILL.md frontmatter "name" field
    description: text("description").notNull(),
    category: text("category", {
      enum: [
        "deployment",
        "database",
        "code-review",
        "planning",
        "design",
        "workflow",
        "utilities",
        "configuration",
      ],
    }).notNull(),
    isUserInvocable: boolean("is_user_invocable").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("skills_category_idx").on(table.category)]
);

// ─── Skill Versions ──────────────────────────────────────────────────────────

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: text("version").notNull(), // semver string, e.g. "1.0.0"
    content: text("content").notNull(), // full SKILL.md text including frontmatter
    references: jsonb("references").$type<Record<string, string>>(), // { "references/templates.md": "<file content>" }
    changelog: text("changelog"),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    isLatest: boolean("is_latest").notNull().default(false),
  },
  (table) => [
    uniqueIndex("skill_versions_skill_version_idx").on(table.skillId, table.version),
    index("skill_versions_skill_id_idx").on(table.skillId),
    index("skill_versions_is_latest_idx").on(table.skillId, table.isLatest),
  ]
);

// ─── User Skill Pins ────────────────────────────────────────────────────────

export const userSkillPins = pgTable(
  "user_skill_pins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    pinnedVersion: text("pinned_version"), // null = follow latest
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_skill_pins_user_skill_idx").on(table.userId, table.skillId),
  ]
);

// ─── Skill Invocations (Telemetry) ─────────────────────────────────────────

export const skillInvocations = pgTable(
  "skill_invocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug").notNull(),
    skillVersion: text("skill_version"),
    invokedAt: timestamp("invoked_at", { withTimezone: true }).notNull().defaultNow(),
    sessionId: text("session_id").notNull(),
    success: boolean("success"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("idx_invocations_skill_slug").on(table.skillSlug),
    index("idx_invocations_user_id").on(table.userId),
    index("idx_invocations_session_id").on(table.sessionId),
    index("idx_invocations_invoked_at").on(table.invokedAt),
  ]
);

// ─── Activity Events ──────────────────────────────────────────────────────

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: [
        "sync",
        "rollback",
        "pin",
        "unpin",
        "feedback",
        "token_generate",
        "token_rotate",
        "publish",
        "version_nudge",
        "feedback_status_change",
      ],
    }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_activity_events_user_created").on(table.userId, table.createdAt),
    index("idx_activity_events_type").on(table.eventType),
  ]
);

// ─── Skill Feedback ────────────────────────────────────────────────────────

export const skillFeedback = pgTable(
  "skill_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug").notNull(),
    skillVersion: text("skill_version"),
    rating: smallint("rating").notNull(), // 1-5
    comment: text("comment"),
    sessionId: text("session_id").notNull(),
    status: text("status", {
      enum: ["new", "acknowledged", "in_progress", "resolved"],
    })
      .notNull()
      .default("new"),
    resolvedByVersionId: uuid("resolved_by_version_id").references(
      () => skillVersions.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_feedback_skill_slug").on(table.skillSlug),
    index("idx_feedback_user_id").on(table.userId),
    index("idx_feedback_session_id").on(table.sessionId),
    index("idx_feedback_status").on(table.status),
  ]
);

// ─── User Installed Versions ──────────────────────────────────────────────

export const userInstalledVersions = pgTable(
  "user_installed_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug").notNull(),
    installedVersion: text("installed_version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_installed_versions_user_skill_idx").on(
      table.userId,
      table.skillSlug
    ),
    index("idx_installed_versions_skill_slug").on(table.skillSlug),
  ]
);
