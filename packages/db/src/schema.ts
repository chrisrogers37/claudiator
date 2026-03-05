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
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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

// ─── Sync Events ──────────────────────────────────────────────────────────

export const syncEvents = pgTable(
  "sync_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: ["sync", "rollback", "pin", "unpin"],
    }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_sync_events_user_created").on(table.userId, table.createdAt),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_feedback_skill_slug").on(table.skillSlug),
    index("idx_feedback_user_id").on(table.userId),
    index("idx_feedback_session_id").on(table.sessionId),
  ]
);

// ─── Learnings (Intelligence Pipeline Display Layer) ────────────────────────

export const learnings = pgTable(
  "learnings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    fullContent: text("full_content"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type", {
      enum: ["blog", "docs", "changelog", "community"],
    }).notNull(),
    relevanceTags: text("relevance_tags").array().default([]),
    distilledAt: timestamp("distilled_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", {
      enum: ["new", "reviewed", "applied", "dismissed"],
    })
      .notNull()
      .default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_learnings_status").on(table.status),
    index("idx_learnings_distilled_at").on(table.distilledAt),
    index("idx_learnings_source_type").on(table.sourceType),
  ]
);

// ─── Learning–Skill Links ────────────────────────────────────────────────────

export const learningSkillLinks = pgTable(
  "learning_skill_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learningId: uuid("learning_id")
      .notNull()
      .references(() => learnings.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug").notNull(),
    proposedChange: text("proposed_change"),
    status: text("status", {
      enum: ["pending", "applied", "rejected"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_skill_links_unique").on(table.learningId, table.skillSlug),
    index("idx_learning_skill_links_learning").on(table.learningId),
    index("idx_learning_skill_links_skill").on(table.skillSlug),
    index("idx_learning_skill_links_status").on(table.status),
  ]
);
