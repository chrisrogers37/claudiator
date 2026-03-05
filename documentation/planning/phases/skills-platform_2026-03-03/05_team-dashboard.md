# Phase 05: Team Dashboard

**Status:** Planned
**PR Title:** add admin team dashboard with adoption, version health, and feedback triage views
**Risk Level:** Medium
**Estimated Effort:** High (~40-50 hours)
**Files Modified:** 3 (`packages/web/src/app/layout.tsx`, `packages/db/src/schema.ts`, `packages/web/src/middleware.ts`)
**Files Created:** 28

---

## Implementation Corrections (added 2026-03-05)

This plan was generated before Phase 01-03 implementation. The code snippets below contain pervasive type, path, and schema errors. **Do NOT copy code verbatim from this document.** Use the feature descriptions and component lists as requirements, but implement against the actual codebase. Key corrections:

### Path corrections
- All `src/app/` paths → `packages/web/src/app/`
- All `src/lib/` paths → `packages/web/src/lib/`
- All `src/components/` paths → `packages/web/src/components/`
- All `src/middleware.ts` → `packages/web/src/middleware.ts`
- Schema location: NOT `src/lib/db/schema.ts` → `packages/db/src/schema.ts`

### Schema type corrections
- All IDs are `uuid`, not `serial` or `integer`. Every `id: serial('id')` → `id: uuid('id').defaultRandom().primaryKey()`
- All FK references (`userId`, `skillId`) are `uuid`, not `integer`
- No `parseInt()` on IDs — they're strings (uuid)
- `timestamp('...', { withTimezone: true })` not `timestamptz('...')`

### Column name corrections
- `users.role` values are `'admin' | 'member'` (not `'user' | 'admin'`)
- `users.lastSyncAt` → does NOT exist. Derive from `syncEvents` table via subquery
- `users.lastActiveAt` → does NOT exist. Derive from `skillInvocations` table via subquery
- `users.tokenGeneratedAt` → does NOT exist. Derive from `apiTokens` table via subquery
- `skillFeedback.skillSlug` (text), NOT `skillFeedback.skillId` (there is no integer FK)
- `skillFeedback.skillVersion` (text), NOT a version FK
- `skillInvocations.skillSlug` (text), NOT `skillInvocations.skillId`
- `skillInvocations.invokedAt`, NOT `skillInvocations.createdAt`
- `skills.slug` is the natural key (text, unique). No `skills.latestVersion` column — derive via `skillVersions` where `isLatest = true`

### Table corrections
- `userSkillVersions` → does NOT exist. Create a new `userInstalledVersions` table to track which version each user has installed (populated during `check_updates` calls)
- `activityEvents` table: instead of creating new, rename/extend existing `syncEvents` table to `activityEvents` with additional event types (`feedback`, `token_generate`, `token_rotate`, `publish`, `version_nudge`, `feedback_status_change`). Requires a DB migration.
- `skillFeedback` needs two new columns: `status` (text, default 'new') and `resolvedByVersionId` (uuid FK to skillVersions.id, nullable)

### Auth pattern corrections
- NOT `getServerSession()` or `getSession(request)` → use `auth()` from `packages/web/src/lib/auth.ts`
- Session user ID accessed via `(session as any).userId` (uuid string)
- Session role accessed via `(session as any).role`

### Styling corrections
- The app uses a **dark terminal aesthetic**, NOT light theme
- NOT `bg-white`, `bg-gray-50`, `text-gray-900` → use `bg-[#0d1117]`, `bg-[#121a2a]`, `text-gray-200`, `border-gray-800`
- Match the existing dashboard page's dark styling conventions
- Accent colors: green-400 (success), amber-400 (warning), red-400 (errors), cyan-400 (info/links)

### Dependency corrections
- `lucide-react` needs to be installed (not present in current package.json)

### Architectural decisions (resolved)
- **Version tracking**: Create `userInstalledVersions` table populated when users call `check_updates`. This enables the version health view.
- **Activity events**: Rename existing `syncEvents` → `activityEvents` via migration, extend with new event types. One table for all platform events.

---

## Context

The claudefather maintainer manages skill distribution for approximately 20 users but has zero visibility into team-wide adoption, version drift, or skill quality. Current feedback arrives via hallway conversations. This phase builds the admin "control tower" -- a set of dashboard pages that answer: "What is happening across my 20 users?" The dashboard surfaces data collected by Phase 02 (telemetry/feedback) and Phase 03 (version registry), presenting it through five views: team overview, skill adoption metrics, version health, feedback triage, and activity feed.

This phase is scoped exclusively to read-only dashboard views and feedback status management. It does not include skill editing (Phase 04 Workshop), intelligence pipeline data (Phase 06), or automated remediation. Admin actions are limited to reviewing data, updating feedback statuses, and sending version nudge notifications.

---

## Dependencies

- **Depends on Phase 01:** Next.js web app, GitHub OAuth authentication, PostgreSQL database, user table, middleware infrastructure.
- **Depends on Phase 02:** Telemetry tables (`skill_invocations`), feedback tables (`skill_feedback`), and the MCP tools that populate them.
- **Depends on Phase 03:** Version registry tables (`skill_versions`, `user_skill_pins`), version metadata. Note: `user_skill_versions` does not exist — Phase 05 must create `user_installed_versions` to track per-user version data (populated via `check_updates` calls).
- **Can run in parallel with Phase 04:** Touches different routes (`/admin/*` vs `/workshop/*`), different API endpoints, and different page components. Both phases share the same Next.js app and database schema but do not modify the same files. Coordinate only on `schema.ts` if both phases add tables.
- **Unlocks:** Phase 06 (Intelligence Pipeline) can add a "learnings" tab to the activity feed once its data sources exist.

---

## Detailed Implementation Plan

### Step 1: Add Admin Role to Database Schema

**File:** `src/lib/db/schema.ts` (exists from Phase 01)

Phase 01 establishes a `users` table with fields for GitHub OAuth identity. Add a `role` column to distinguish admins from regular users.

Add to the `users` table definition:

```typescript
// In the users table definition, add after existing columns:
role: text('role').notNull().default('user'), // 'user' | 'admin'
```

The first user to register becomes admin. This is handled in the OAuth callback (Step 2). Alternatively, an environment variable `ADMIN_GITHUB_USERNAME` can pre-designate the admin.

Add a new table for the activity feed:

```typescript
export const activityEvents = pgTable('activity_events', {
  id: serial('id').primaryKey(),
  eventType: text('event_type').notNull(), // 'sync' | 'publish' | 'feedback' | 'token_generate' | 'token_rotate' | 'learning'
  userId: integer('user_id').references(() => users.id),
  skillId: integer('skill_id').references(() => skills.id),
  metadata: jsonb('metadata'), // event-specific payload (version number, feedback excerpt, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  user: one(users, { fields: [activityEvents.userId], references: [users.id] }),
  skill: one(skills, { fields: [activityEvents.skillId], references: [skills.id] }),
}));
```

Add a `status` column to the feedback table (from Phase 02) if not already present:

```typescript
// In the skill_feedback table, add:
status: text('status').notNull().default('new'), // 'new' | 'acknowledged' | 'in_progress' | 'resolved'
resolvedByVersionId: integer('resolved_by_version_id').references(() => skillVersions.id),
```

**Migration:** Create a new Drizzle migration for these schema changes:

```bash
npx drizzle-kit generate:pg --name add-admin-role-and-activity-feed
npx drizzle-kit push:pg
```

### Step 2: Configure Admin Role Assignment

**File to create:** `src/lib/auth/admin.ts`

```typescript
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';

const ADMIN_GITHUB_USERNAME = process.env.ADMIN_GITHUB_USERNAME;

export async function assignRoleOnRegistration(userId: number, githubUsername: string): Promise<'admin' | 'user'> {
  // Method 1: Environment variable designation
  if (ADMIN_GITHUB_USERNAME && githubUsername === ADMIN_GITHUB_USERNAME) {
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, userId));
    return 'admin';
  }

  // Method 2: First user becomes admin
  const [{ userCount }] = await db.select({ userCount: count() }).from(users);
  if (userCount === 1) {
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, userId));
    return 'admin';
  }

  return 'user';
}

export async function isAdmin(userId: number): Promise<boolean> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role === 'admin';
}

export async function promoteToAdmin(userId: number): Promise<void> {
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, userId));
}
```

**Integration point:** In the Phase 01 OAuth callback handler (likely `src/app/api/auth/callback/route.ts`), call `assignRoleOnRegistration()` after creating the user record.

### Step 3: Add Admin Middleware Guard

**File to create:** `src/middleware/admin.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session'; // From Phase 01
import { isAdmin } from '@/lib/auth/admin';

export async function adminGuard(request: NextRequest): Promise<NextResponse | null> {
  const session = await getSession(request);
  if (!session?.userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  
  const admin = await isAdmin(session.userId);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  
  return null; // Proceed
}
```

**File:** `src/middleware.ts` (exists from Phase 01)

Add admin route matching to the existing middleware:

```typescript
// Add to the existing middleware matcher config:
export const config = {
  matcher: [
    // ... existing matchers from Phase 01
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};

// In the middleware function, add before existing route handling:
if (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/api/admin')) {
  const guardResult = await adminGuard(request);
  if (guardResult) return guardResult;
}
```

### Step 4: Create Admin API Routes

#### 4a. User List with Stats

**File to create:** `src/app/api/admin/users/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, skillInvocations, userSkillVersions } from '@/lib/db/schema';
import { eq, count, max, sql, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sortBy = searchParams.get('sort') || 'lastActive';
  const sortDir = searchParams.get('dir') || 'desc';

  const userStats = await db
    .select({
      id: users.id,
      githubUsername: users.githubUsername,
      avatarUrl: users.avatarUrl,
      role: users.role,
      createdAt: users.createdAt,
      lastSyncAt: users.lastSyncAt,
      lastActiveAt: users.lastActiveAt,
      skillCount: sql<number>`(
        SELECT COUNT(DISTINCT skill_id)
        FROM ${userSkillVersions}
        WHERE ${userSkillVersions.userId} = ${users.id}
      )`,
      totalInvocations: sql<number>`(
        SELECT COUNT(*)
        FROM ${skillInvocations}
        WHERE ${skillInvocations.userId} = ${users.id}
      )`,
      hasToken: sql<boolean>`(${users.tokenGeneratedAt} IS NOT NULL)`,
    })
    .from(users)
    .orderBy(sortDir === 'desc' ? desc(users.lastActiveAt) : users.lastActiveAt);

  // Compute sync health flags
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const enrichedUsers = userStats.map((user) => {
    let syncStatus: 'current' | 'stale' | 'critical' | 'never' = 'current';
    if (!user.lastSyncAt) {
      syncStatus = 'never';
    } else if (user.lastSyncAt < thirtyDaysAgo) {
      syncStatus = 'critical'; // Red flag: >30 days
    } else if (user.lastSyncAt < sevenDaysAgo) {
      syncStatus = 'stale'; // Amber flag: >7 days
    }

    // Onboarding completeness
    const onboardingComplete = Boolean(
      user.githubUsername && user.hasToken && user.lastSyncAt
    );

    return { ...user, syncStatus, onboardingComplete };
  });

  return NextResponse.json({ users: enrichedUsers });
}
```

#### 4b. Aggregate Skill Metrics

**File to create:** `src/app/api/admin/skills/metrics/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skills, skillInvocations, skillFeedback, userSkillVersions, skillVersions } from '@/lib/db/schema';
import { eq, count, avg, sql, gte, and, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sortBy = searchParams.get('sort') || 'invocations_30d';
  const sortDir = searchParams.get('dir') || 'desc';

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const skillMetrics = await db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      latestVersion: skills.latestVersion,
      invocations7d: sql<number>`(
        SELECT COUNT(*) FROM ${skillInvocations}
        WHERE ${skillInvocations.skillId} = ${skills.id}
        AND ${skillInvocations.createdAt} >= ${sevenDaysAgo}
      )`,
      invocations30d: sql<number>`(
        SELECT COUNT(*) FROM ${skillInvocations}
        WHERE ${skillInvocations.skillId} = ${skills.id}
        AND ${skillInvocations.createdAt} >= ${thirtyDaysAgo}
      )`,
      invocationsTotal: sql<number>`(
        SELECT COUNT(*) FROM ${skillInvocations}
        WHERE ${skillInvocations.skillId} = ${skills.id}
      )`,
      uniqueUsers7d: sql<number>`(
        SELECT COUNT(DISTINCT user_id) FROM ${skillInvocations}
        WHERE ${skillInvocations.skillId} = ${skills.id}
        AND ${skillInvocations.createdAt} >= ${sevenDaysAgo}
      )`,
      uniqueUsers30d: sql<number>`(
        SELECT COUNT(DISTINCT user_id) FROM ${skillInvocations}
        WHERE ${skillInvocations.skillId} = ${skills.id}
        AND ${skillInvocations.createdAt} >= ${thirtyDaysAgo}
      )`,
      averageRating: sql<number>`(
        SELECT AVG(rating) FROM ${skillFeedback}
        WHERE ${skillFeedback.skillId} = ${skills.id}
        AND ${skillFeedback.rating} IS NOT NULL
      )`,
      feedbackCount: sql<number>`(
        SELECT COUNT(*) FROM ${skillFeedback}
        WHERE ${skillFeedback.skillId} = ${skills.id}
      )`,
    })
    .from(skills);

  // Add highlight flags
  const enriched = skillMetrics.map((skill) => ({
    ...skill,
    isDead: skill.invocations30d === 0, // No invocations in 30 days
    isProblem: skill.averageRating !== null && skill.averageRating < 3.0,
  }));

  // Sort in application layer (flexible multi-column sorting)
  const sortKey = sortBy as keyof typeof enriched[0];
  enriched.sort((a, b) => {
    const aVal = (a as any)[sortKey] ?? 0;
    const bVal = (b as any)[sortKey] ?? 0;
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  return NextResponse.json({ skills: enriched });
}
```

#### 4c. Version Health

**File to create:** `src/app/api/admin/versions/health/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skills, skillVersions, userSkillVersions, users } from '@/lib/db/schema';
import { eq, sql, count } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  // For each skill, get version distribution across users
  const allSkills = await db.select().from(skills);

  const healthData = await Promise.all(
    allSkills.map(async (skill) => {
      // Get version distribution
      const distribution = await db
        .select({
          version: skillVersions.version,
          versionId: skillVersions.id,
          userCount: count(userSkillVersions.userId),
          isLatest: sql<boolean>`(${skillVersions.version} = ${skill.latestVersion})`,
        })
        .from(skillVersions)
        .leftJoin(
          userSkillVersions,
          eq(userSkillVersions.versionId, skillVersions.id)
        )
        .where(eq(skillVersions.skillId, skill.id))
        .groupBy(skillVersions.id, skillVersions.version);

      const totalUsers = distribution.reduce((sum, d) => sum + d.userCount, 0);
      const usersOnLatest = distribution.find((d) => d.isLatest)?.userCount ?? 0;
      const driftPercent = totalUsers > 0 ? ((totalUsers - usersOnLatest) / totalUsers) * 100 : 0;

      // Get list of users NOT on latest (for nudge action)
      const behindUsers = await db
        .select({
          userId: users.id,
          githubUsername: users.githubUsername,
          currentVersion: skillVersions.version,
        })
        .from(userSkillVersions)
        .innerJoin(users, eq(users.id, userSkillVersions.userId))
        .innerJoin(skillVersions, eq(skillVersions.id, userSkillVersions.versionId))
        .where(
          and(
            eq(userSkillVersions.skillId, skill.id),
            sql`${skillVersions.version} != ${skill.latestVersion}`
          )
        );

      return {
        skillId: skill.id,
        skillName: skill.name,
        latestVersion: skill.latestVersion,
        totalUsers,
        usersOnLatest,
        driftPercent: Math.round(driftPercent),
        needsAttention: driftPercent > 50, // Flag if >50% not on latest
        distribution,
        behindUsers,
      };
    })
  );

  return NextResponse.json({ versions: healthData });
}
```

#### 4d. Feedback Triage

**File to create:** `src/app/api/admin/feedback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skillFeedback, skills, users, skillVersions } from '@/lib/db/schema';
import { eq, desc, asc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sortBy = searchParams.get('sort') || 'createdAt'; // 'createdAt' | 'rating' | 'volume'
  const filterStatus = searchParams.get('status'); // 'new' | 'acknowledged' | 'in_progress' | 'resolved' | null (all)
  const filterSkill = searchParams.get('skillId');

  let query = db
    .select({
      id: skillFeedback.id,
      skillId: skillFeedback.skillId,
      skillName: skills.name,
      userId: skillFeedback.userId,
      githubUsername: users.githubUsername,
      rating: skillFeedback.rating,
      comment: skillFeedback.comment,
      status: skillFeedback.status,
      resolvedByVersionId: skillFeedback.resolvedByVersionId,
      resolvedByVersion: skillVersions.version,
      createdAt: skillFeedback.createdAt,
    })
    .from(skillFeedback)
    .innerJoin(skills, eq(skills.id, skillFeedback.skillId))
    .innerJoin(users, eq(users.id, skillFeedback.userId))
    .leftJoin(skillVersions, eq(skillVersions.id, skillFeedback.resolvedByVersionId));

  // Apply filters
  const conditions = [];
  if (filterStatus) {
    conditions.push(eq(skillFeedback.status, filterStatus));
  }
  if (filterSkill) {
    conditions.push(eq(skillFeedback.skillId, parseInt(filterSkill)));
  }

  // Apply sorting
  let orderClause;
  switch (sortBy) {
    case 'rating':
      orderClause = asc(skillFeedback.rating); // Worst first
      break;
    case 'createdAt':
    default:
      orderClause = desc(skillFeedback.createdAt); // Most recent first
      break;
  }

  const feedback = await query.orderBy(orderClause);

  return NextResponse.json({ feedback });
}
```

#### 4e. Feedback Status Update

**File to create:** `src/app/api/admin/feedback/[id]/status/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skillFeedback, activityEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

const VALID_STATUSES = ['new', 'acknowledged', 'in_progress', 'resolved'] as const;
type FeedbackStatus = typeof VALID_STATUSES[number];

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  const feedbackId = parseInt(params.id);
  const body = await request.json();
  const { status, resolvedByVersionId } = body as {
    status: FeedbackStatus;
    resolvedByVersionId?: number;
  };

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate feedback exists
  const [existing] = await db
    .select()
    .from(skillFeedback)
    .where(eq(skillFeedback.id, feedbackId));

  if (!existing) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
  }

  // Update status
  const updateData: Record<string, any> = { status };
  if (status === 'resolved' && resolvedByVersionId) {
    updateData.resolvedByVersionId = resolvedByVersionId;
  }

  await db.update(skillFeedback).set(updateData).where(eq(skillFeedback.id, feedbackId));

  // Log activity event
  await db.insert(activityEvents).values({
    eventType: 'feedback_status_change',
    userId: session!.userId,
    skillId: existing.skillId,
    metadata: { feedbackId, oldStatus: existing.status, newStatus: status },
  });

  return NextResponse.json({ success: true, feedbackId, status });
}
```

#### 4f. Activity Feed

**File to create:** `src/app/api/admin/activity/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activityEvents, users, skills } from '@/lib/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filterType = searchParams.get('type'); // event type filter
  const filterUser = searchParams.get('userId');
  const filterSkill = searchParams.get('skillId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');

  const conditions = [];
  if (filterType) {
    const types = filterType.split(',');
    conditions.push(inArray(activityEvents.eventType, types));
  }
  if (filterUser) {
    conditions.push(eq(activityEvents.userId, parseInt(filterUser)));
  }
  if (filterSkill) {
    conditions.push(eq(activityEvents.skillId, parseInt(filterSkill)));
  }

  const events = await db
    .select({
      id: activityEvents.id,
      eventType: activityEvents.eventType,
      userId: activityEvents.userId,
      githubUsername: users.githubUsername,
      avatarUrl: users.avatarUrl,
      skillId: activityEvents.skillId,
      skillName: skills.name,
      metadata: activityEvents.metadata,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.userId))
    .leftJoin(skills, eq(skills.id, activityEvents.skillId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ events, limit, offset });
}
```

#### 4g. Nudge Action (Version Health)

**File to create:** `src/app/api/admin/versions/nudge/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activityEvents, skills } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const { skillId, userIds } = (await request.json()) as {
    skillId: number;
    userIds: number[];
  };

  if (!skillId || !userIds?.length) {
    return NextResponse.json(
      { error: 'skillId and userIds[] are required' },
      { status: 400 }
    );
  }

  const [skill] = await db.select().from(skills).where(eq(skills.id, skillId));
  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  // Record nudge events (one per user) -- these become notifications
  // via the MCP notification tool when the user's next session starts
  const nudgeEvents = userIds.map((userId) => ({
    eventType: 'version_nudge' as const,
    userId,
    skillId,
    metadata: {
      latestVersion: skill.latestVersion,
      nudgedBy: session!.userId,
    },
  }));

  await db.insert(activityEvents).values(nudgeEvents);

  return NextResponse.json({
    success: true,
    nudgedCount: userIds.length,
    skillName: skill.name,
  });
}
```

### Step 5: Create Admin Dashboard Pages

#### 5a. Admin Layout

**File to create:** `src/app/admin/layout.tsx`

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/admin';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect('/login');

  const admin = await isAdmin(session.userId);
  if (!admin) redirect('/dashboard'); // Regular users go to their own dashboard (Phase 01)

  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

#### 5b. Admin Navigation Component

**File to create:** `src/components/admin/AdminNav.tsx`

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, BarChart3, GitBranch, MessageSquare, Activity } from 'lucide-react';

const navItems = [
  { href: '/admin/team', label: 'Team', icon: Users },
  { href: '/admin/skills', label: 'Skills', icon: BarChart3 },
  { href: '/admin/versions', label: 'Versions', icon: GitBranch },
  { href: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
  { href: '/admin/activity', label: 'Activity', icon: Activity },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="w-64 border-r bg-gray-50 p-4">
      <h2 className="mb-6 text-lg font-semibold text-gray-900">Admin Dashboard</h2>
      <ul className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

#### 5c. Team Overview Page

**File to create:** `src/app/admin/team/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { SortableTable } from '@/components/admin/SortableTable';
import { SyncStatusBadge } from '@/components/admin/SyncStatusBadge';
import { OnboardingFunnel } from '@/components/admin/OnboardingFunnel';

interface UserRow {
  id: number;
  githubUsername: string;
  avatarUrl: string;
  role: string;
  createdAt: string;
  lastSyncAt: string | null;
  lastActiveAt: string | null;
  skillCount: number;
  totalInvocations: number;
  syncStatus: 'current' | 'stale' | 'critical' | 'never';
  onboardingComplete: boolean;
  hasToken: boolean;
}

export default function TeamPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users);
        setLoading(false);
      });
  }, []);

  // Onboarding funnel calculation
  const funnel = {
    registered: users.length,
    tokenGenerated: users.filter((u) => u.hasToken).length,
    firstSync: users.filter((u) => u.lastSyncAt).length,
    fullyOnboarded: users.filter((u) => u.onboardingComplete).length,
  };

  const columns = [
    {
      key: 'githubUsername',
      label: 'User',
      render: (user: UserRow) => (
        <div className="flex items-center gap-2">
          <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
          <span>{user.githubUsername}</span>
          {user.role === 'admin' && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
              admin
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'lastSyncAt',
      label: 'Last Sync',
      render: (user: UserRow) => (
        <SyncStatusBadge status={user.syncStatus} date={user.lastSyncAt} />
      ),
    },
    { key: 'skillCount', label: 'Skills', sortable: true },
    { key: 'totalInvocations', label: 'Invocations', sortable: true },
    {
      key: 'lastActiveAt',
      label: 'Last Active',
      render: (user: UserRow) =>
        user.lastActiveAt
          ? new Date(user.lastActiveAt).toLocaleDateString()
          : 'Never',
      sortable: true,
    },
  ];

  if (loading) return <div className="animate-pulse">Loading team data...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Team Overview</h1>

      <OnboardingFunnel funnel={funnel} />

      <SortableTable
        data={users}
        columns={columns}
        defaultSort="lastActiveAt"
        defaultDir="desc"
      />
    </div>
  );
}
```

#### 5d. Skill Adoption Metrics Page

**File to create:** `src/app/admin/skills/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { SortableTable } from '@/components/admin/SortableTable';

interface SkillMetric {
  id: number;
  name: string;
  description: string;
  latestVersion: string;
  invocations7d: number;
  invocations30d: number;
  invocationsTotal: number;
  uniqueUsers7d: number;
  uniqueUsers30d: number;
  averageRating: number | null;
  feedbackCount: number;
  isDead: boolean;
  isProblem: boolean;
}

export default function SkillsMetricsPage() {
  const [skills, setSkills] = useState<SkillMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/skills/metrics')
      .then((res) => res.json())
      .then((data) => {
        setSkills(data.skills);
        setLoading(false);
      });
  }, []);

  const columns = [
    {
      key: 'name',
      label: 'Skill',
      render: (skill: SkillMetric) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{skill.name}</span>
          {skill.isDead && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
              dead
            </span>
          )}
          {skill.isProblem && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
              low rating
            </span>
          )}
        </div>
      ),
    },
    { key: 'invocations7d', label: '7d Invocations', sortable: true },
    { key: 'invocations30d', label: '30d Invocations', sortable: true },
    { key: 'invocationsTotal', label: 'Total', sortable: true },
    { key: 'uniqueUsers7d', label: '7d Users', sortable: true },
    { key: 'uniqueUsers30d', label: '30d Users', sortable: true },
    {
      key: 'averageRating',
      label: 'Avg Rating',
      render: (skill: SkillMetric) =>
        skill.averageRating !== null
          ? `${skill.averageRating.toFixed(1)} / 5`
          : '—',
      sortable: true,
    },
    { key: 'feedbackCount', label: 'Feedback', sortable: true },
  ];

  if (loading) return <div className="animate-pulse">Loading skill metrics...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Skill Adoption</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-gray-500">Total Skills</div>
          <div className="text-2xl font-bold">{skills.length}</div>
        </div>
        <div className="rounded-lg border bg-red-50 p-4">
          <div className="text-sm text-red-600">Dead Skills (0 invocations 30d)</div>
          <div className="text-2xl font-bold text-red-700">
            {skills.filter((s) => s.isDead).length}
          </div>
        </div>
        <div className="rounded-lg border bg-amber-50 p-4">
          <div className="text-sm text-amber-600">Problem Skills (rating &lt; 3.0)</div>
          <div className="text-2xl font-bold text-amber-700">
            {skills.filter((s) => s.isProblem).length}
          </div>
        </div>
      </div>

      <SortableTable
        data={skills}
        columns={columns}
        defaultSort="invocations30d"
        defaultDir="desc"
      />
    </div>
  );
}
```

#### 5e. Version Health Page

**File to create:** `src/app/admin/versions/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { VersionDistributionChart } from '@/components/admin/VersionDistributionChart';

interface VersionHealth {
  skillId: number;
  skillName: string;
  latestVersion: string;
  totalUsers: number;
  usersOnLatest: number;
  driftPercent: number;
  needsAttention: boolean;
  distribution: Array<{
    version: string;
    versionId: number;
    userCount: number;
    isLatest: boolean;
  }>;
  behindUsers: Array<{
    userId: number;
    githubUsername: string;
    currentVersion: string;
  }>;
}

export default function VersionsPage() {
  const [versions, setVersions] = useState<VersionHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [nudging, setNudging] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/versions/health')
      .then((res) => res.json())
      .then((data) => {
        setVersions(data.versions);
        setLoading(false);
      });
  }, []);

  async function handleNudge(skillId: number, userIds: number[]) {
    setNudging(skillId);
    await fetch('/api/admin/versions/nudge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId, userIds }),
    });
    setNudging(null);
  }

  if (loading) return <div className="animate-pulse">Loading version health...</div>;

  // Sort: skills needing attention first, then by drift percent descending
  const sorted = [...versions].sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return b.driftPercent - a.driftPercent;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Version Health</h1>

      <div className="grid gap-4">
        {sorted.map((skill) => (
          <div
            key={skill.skillId}
            className={`rounded-lg border p-4 ${
              skill.needsAttention ? 'border-red-200 bg-red-50' : 'bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{skill.skillName}</h3>
                <p className="text-sm text-gray-500">
                  Latest: {skill.latestVersion} &middot;{' '}
                  {skill.usersOnLatest}/{skill.totalUsers} users on latest &middot;{' '}
                  {skill.driftPercent}% drift
                </p>
              </div>
              {skill.behindUsers.length > 0 && (
                <button
                  onClick={() =>
                    handleNudge(
                      skill.skillId,
                      skill.behindUsers.map((u) => u.userId)
                    )
                  }
                  disabled={nudging === skill.skillId}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {nudging === skill.skillId ? 'Sending...' : `Nudge ${skill.behindUsers.length} users`}
                </button>
              )}
            </div>

            <VersionDistributionChart distribution={skill.distribution} />

            {skill.behindUsers.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-gray-500">
                  {skill.behindUsers.length} users behind
                </summary>
                <ul className="mt-1 space-y-1 pl-4 text-sm">
                  {skill.behindUsers.map((u) => (
                    <li key={u.userId}>
                      {u.githubUsername} — on {u.currentVersion}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 5f. Feedback Triage Page

**File to create:** `src/app/admin/feedback/page.tsx`

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface FeedbackItem {
  id: number;
  skillId: number;
  skillName: string;
  userId: number;
  githubUsername: string;
  rating: number | null;
  comment: string;
  status: 'new' | 'acknowledged' | 'in_progress' | 'resolved';
  resolvedByVersion: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = ['new', 'acknowledged', 'in_progress', 'resolved'] as const;
const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
};

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [sortBy, setSortBy] = useState('createdAt');

  const fetchFeedback = useCallback(() => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    params.set('sort', sortBy);
    fetch(`/api/admin/feedback?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setFeedback(data.feedback);
        setLoading(false);
      });
  }, [filterStatus, sortBy]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  async function updateStatus(feedbackId: number, newStatus: string) {
    await fetch(`/api/admin/feedback/${feedbackId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchFeedback(); // Refresh
  }

  if (loading) return <div className="animate-pulse">Loading feedback...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Feedback Triage</h1>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
        >
          <option value="createdAt">Most recent</option>
          <option value="rating">Worst rated</option>
        </select>
      </div>

      {/* Feedback list */}
      <div className="space-y-3">
        {feedback.map((item) => (
          <div key={item.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/workshop/${item.skillId}`}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    {item.skillName}
                  </Link>
                  {item.rating !== null && (
                    <span className="text-sm text-gray-500">
                      {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-700">{item.comment}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {item.githubUsername} &middot;{' '}
                  {new Date(item.createdAt).toLocaleDateString()}
                  {item.resolvedByVersion && (
                    <> &middot; Resolved in v{item.resolvedByVersion}</>
                  )}
                </p>
              </div>
              <select
                value={item.status}
                onChange={(e) => updateStatus(item.id, e.target.value)}
                className={`rounded px-2 py-1 text-xs font-medium ${STATUS_COLORS[item.status]}`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {feedback.length === 0 && (
          <p className="text-center text-gray-400">No feedback matching filters.</p>
        )}
      </div>
    </div>
  );
}
```

#### 5g. Activity Feed Page

**File to create:** `src/app/admin/activity/page.tsx`

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { GitBranch, MessageSquare, Key, Zap, RefreshCw } from 'lucide-react';

interface ActivityEvent {
  id: number;
  eventType: string;
  userId: number | null;
  githubUsername: string | null;
  avatarUrl: string | null;
  skillId: number | null;
  skillName: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

const EVENT_TYPES = [
  'sync', 'publish', 'feedback', 'token_generate', 'token_rotate',
  'version_nudge', 'feedback_status_change',
];

const EVENT_ICONS: Record<string, any> = {
  sync: RefreshCw,
  publish: GitBranch,
  feedback: MessageSquare,
  token_generate: Key,
  token_rotate: Key,
  version_nudge: Zap,
  feedback_status_change: MessageSquare,
};

function eventDescription(event: ActivityEvent): string {
  switch (event.eventType) {
    case 'sync':
      return `${event.githubUsername} synced their skills`;
    case 'publish':
      return `${event.skillName} v${event.metadata?.version} published`;
    case 'feedback':
      return `${event.githubUsername} left feedback on ${event.skillName}`;
    case 'token_generate':
      return `${event.githubUsername} generated an API token`;
    case 'token_rotate':
      return `${event.githubUsername} rotated their API token`;
    case 'version_nudge':
      return `Nudge sent to ${event.githubUsername} for ${event.skillName}`;
    case 'feedback_status_change':
      return `Feedback on ${event.skillName} marked ${event.metadata?.newStatus}`;
    default:
      return `${event.eventType} event`;
  }
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');

  const fetchEvents = useCallback(() => {
    const params = new URLSearchParams();
    if (filterType) params.set('type', filterType);
    params.set('limit', '100');
    fetch(`/api/admin/activity?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events);
        setLoading(false);
      });
  }, [filterType]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  if (loading) return <div className="animate-pulse">Loading activity...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity Feed</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setFilterType('')}
          className={`rounded px-3 py-1 text-sm ${!filterType ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}
        >
          All
        </button>
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`rounded px-3 py-1 text-sm ${
              filterType === type ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {type.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {events.map((event) => {
          const Icon = EVENT_ICONS[event.eventType] || Zap;
          return (
            <div key={event.id} className="flex items-center gap-3 rounded border bg-white p-3">
              <Icon className="h-4 w-4 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm">{eventDescription(event)}</p>
                <p className="text-xs text-gray-400">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
              {event.avatarUrl && (
                <img src={event.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
              )}
            </div>
          );
        })}
        {events.length === 0 && (
          <p className="text-center text-gray-400">No activity events.</p>
        )}
      </div>
    </div>
  );
}
```

### Step 6: Create Shared UI Components

#### 6a. Sortable Table Component

**File to create:** `src/components/admin/SortableTable.tsx`

```tsx
'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
}

interface SortableTableProps<T> {
  data: T[];
  columns: Column<T>[];
  defaultSort: string;
  defaultDir: 'asc' | 'desc';
}

export function SortableTable<T extends Record<string, any>>({
  data,
  columns,
  defaultSort,
  defaultDir,
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSort);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey] ?? '';
    const bVal = b[sortKey] ?? '';
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === 'desc' ? -cmp : cmp;
  });

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-medium text-gray-600 ${
                  col.sortable !== false ? 'cursor-pointer select-none hover:text-gray-900' : ''
                }`}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((item, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3">
                  {col.render ? col.render(item) : item[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### 6b. Sync Status Badge

**File to create:** `src/components/admin/SyncStatusBadge.tsx`

```tsx
interface SyncStatusBadgeProps {
  status: 'current' | 'stale' | 'critical' | 'never';
  date: string | null;
}

const STATUS_STYLES = {
  current: 'bg-green-100 text-green-800',
  stale: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
  never: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  current: 'Current',
  stale: '>7 days',
  critical: '>30 days',
  never: 'Never synced',
};

export function SyncStatusBadge({ status, date }: SyncStatusBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
        {STATUS_LABELS[status]}
      </span>
      {date && <span className="text-xs text-gray-400">{new Date(date).toLocaleDateString()}</span>}
    </div>
  );
}
```

#### 6c. Onboarding Funnel Component

**File to create:** `src/components/admin/OnboardingFunnel.tsx`

```tsx
interface FunnelData {
  registered: number;
  tokenGenerated: number;
  firstSync: number;
  fullyOnboarded: number;
}

export function OnboardingFunnel({ funnel }: { funnel: FunnelData }) {
  const steps = [
    { label: 'Registered (GitHub auth)', count: funnel.registered },
    { label: 'Token generated', count: funnel.tokenGenerated },
    { label: 'First sync completed', count: funnel.firstSync },
    { label: 'Fully onboarded', count: funnel.fullyOnboarded },
  ];

  const maxCount = Math.max(funnel.registered, 1);

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 font-semibold text-gray-900">Onboarding Funnel</h3>
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const widthPercent = (step.count / maxCount) * 100;
          return (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-40 text-sm text-gray-600">{step.label}</div>
              <div className="flex-1">
                <div
                  className="h-6 rounded bg-blue-500 transition-all"
                  style={{ width: `${widthPercent}%`, minWidth: step.count > 0 ? '2rem' : '0' }}
                />
              </div>
              <div className="w-8 text-right text-sm font-medium">{step.count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

#### 6d. Version Distribution Chart

**File to create:** `src/components/admin/VersionDistributionChart.tsx`

```tsx
interface Distribution {
  version: string;
  versionId: number;
  userCount: number;
  isLatest: boolean;
}

export function VersionDistributionChart({
  distribution,
}: {
  distribution: Distribution[];
}) {
  const maxCount = Math.max(...distribution.map((d) => d.userCount), 1);

  // Sort versions in descending order (latest first)
  const sorted = [...distribution].sort((a, b) => {
    if (a.isLatest) return -1;
    if (b.isLatest) return 1;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });

  return (
    <div className="mt-3 space-y-1">
      {sorted.map((d) => {
        const widthPercent = (d.userCount / maxCount) * 100;
        return (
          <div key={d.versionId} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-right text-gray-500">
              v{d.version}
              {d.isLatest && ' ✓'}
            </span>
            <div className="flex-1">
              <div
                className={`h-4 rounded ${d.isLatest ? 'bg-green-500' : 'bg-gray-300'}`}
                style={{ width: `${widthPercent}%`, minWidth: d.userCount > 0 ? '1rem' : '0' }}
              />
            </div>
            <span className="w-6 text-gray-500">{d.userCount}</span>
          </div>
        );
      })}
    </div>
  );
}
```

### Step 7: Wire Activity Events into Existing Flows

The activity feed depends on events being logged throughout the application. The following integration points must be added to existing Phase 01/02/03 code. Each is a single `db.insert(activityEvents)` call.

**In the sync handler (Phase 01 MCP sync tool response handler):**

```typescript
// After successful sync, log activity event
await db.insert(activityEvents).values({
  eventType: 'sync',
  userId: session.userId,
  metadata: { skillCount: syncedSkills.length },
});
```

**In the feedback submission handler (Phase 02 API route):**

```typescript
// After inserting feedback
await db.insert(activityEvents).values({
  eventType: 'feedback',
  userId: session.userId,
  skillId: feedback.skillId,
  metadata: { rating: feedback.rating, feedbackId: inserted.id },
});
```

**In the version publish handler (Phase 03 API route or Phase 04 Workshop):**

```typescript
// After publishing a new version
await db.insert(activityEvents).values({
  eventType: 'publish',
  userId: session.userId,
  skillId: version.skillId,
  metadata: { version: version.version },
});
```

**In the token generation/rotation handler (Phase 01):**

```typescript
// After generating or rotating a token
await db.insert(activityEvents).values({
  eventType: isRotation ? 'token_rotate' : 'token_generate',
  userId: session.userId,
  metadata: { tokenName: token.name },
});
```

### Step 8: Add Admin Link to App Layout

**File:** `src/app/layout.tsx` (exists from Phase 01)

In the global navigation component, add a conditional admin link:

```tsx
// In the nav component, after existing links:
{session?.role === 'admin' && (
  <Link href="/admin/team" className="text-sm font-medium text-gray-600 hover:text-gray-900">
    Admin
  </Link>
)}
```

### Step 9: Admin Redirect

**File to create:** `src/app/admin/page.tsx`

```tsx
import { redirect } from 'next/navigation';

export default function AdminPage() {
  redirect('/admin/team');
}
```

---

## Test Plan

### Automated Tests

#### API Route Tests

**File to create:** `src/app/api/admin/__tests__/users.test.ts`

Tests to write:
1. GET `/api/admin/users` returns 401 for unauthenticated requests
2. GET `/api/admin/users` returns 403 for non-admin users
3. GET `/api/admin/users` returns user list with stats for admin
4. Sync status flags computed correctly: current (<7d), stale (7-30d), critical (>30d), never (null)
5. Onboarding completeness correctly requires GitHub auth + token + first sync
6. Sort parameter works (by lastActive, skillCount, totalInvocations)

**File to create:** `src/app/api/admin/__tests__/skills-metrics.test.ts`

Tests to write:
1. GET `/api/admin/skills/metrics` returns aggregate metrics per skill
2. `isDead` flag is true when invocations30d equals 0
3. `isProblem` flag is true when averageRating is below 3.0
4. Time-windowed counts are accurate (7d vs 30d vs all time)
5. Skills with no feedback return null for averageRating

**File to create:** `src/app/api/admin/__tests__/versions-health.test.ts`

Tests to write:
1. GET `/api/admin/versions/health` returns version distribution per skill
2. `needsAttention` flag is true when driftPercent exceeds 50
3. `behindUsers` list excludes users on latest version
4. POST `/api/admin/versions/nudge` creates activity events for each user
5. POST `/api/admin/versions/nudge` returns 400 with missing skillId or userIds

**File to create:** `src/app/api/admin/__tests__/feedback.test.ts`

Tests to write:
1. GET `/api/admin/feedback` returns feedback with skill and user join data
2. Status filter works correctly
3. Sort by rating returns worst-rated first
4. POST `/api/admin/feedback/:id/status` updates status and logs activity event
5. POST with invalid status returns 400
6. POST with nonexistent feedback ID returns 404
7. Resolution version link is set when status is resolved with resolvedByVersionId

**File to create:** `src/app/api/admin/__tests__/activity.test.ts`

Tests to write:
1. GET `/api/admin/activity` returns chronologically ordered events
2. Type filter narrows results to specified event types
3. User and skill filters work correctly
4. Pagination (limit/offset) works correctly
5. Events include joined user and skill data

#### Admin Role Tests

**File to create:** `src/lib/auth/__tests__/admin.test.ts`

Tests to write:
1. First registered user receives admin role
2. Subsequent users receive user role
3. `ADMIN_GITHUB_USERNAME` env var overrides first-user logic
4. `isAdmin` returns true for admin users, false for regular users
5. `promoteToAdmin` changes user role from user to admin

### Manual Verification Steps

1. Log in as the first user, confirm you see the Admin link in navigation
2. Log in as a second user, confirm you do NOT see the Admin link and `/admin/team` redirects to `/dashboard`
3. Navigate to `/admin/team`, verify all users appear with correct sync status colors (green/amber/red/gray)
4. Navigate to `/admin/skills`, verify metrics match raw database counts
5. Navigate to `/admin/versions`, verify the version distribution chart shows correct proportions
6. Click "Nudge N users" on a skill with version drift, verify activity event is created
7. Navigate to `/admin/feedback`, change a feedback item's status, verify the status persists on refresh
8. Navigate to `/admin/activity`, verify events appear in chronological order
9. Apply type filter on activity feed, verify only matching events shown
10. Click a skill name in feedback triage, verify it links to `/workshop/{skillId}` (Phase 04)

---

## Documentation Updates

### README.md

Add an "Admin Dashboard" section under the web app documentation:

```markdown
### Admin Dashboard

The admin dashboard is available at `/admin` for users with the admin role. It provides:

- **Team Overview** (`/admin/team`) — User list with sync health and onboarding funnel
- **Skill Adoption** (`/admin/skills`) — Aggregate metrics, dead/problem skill detection
- **Version Health** (`/admin/versions`) — Version drift visualization with nudge actions
- **Feedback Triage** (`/admin/feedback`) — Review and manage user feedback
- **Activity Feed** (`/admin/activity`) — Chronological platform event stream

The first user to register automatically becomes admin. Additional admins can be
designated via the `ADMIN_GITHUB_USERNAME` environment variable or promoted by
existing admins.
```

### API Documentation

Add admin API endpoint documentation (location depends on Phase 01's doc structure, likely a `docs/api.md` or inline in README):

```markdown
#### Admin Endpoints (require admin role)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | User list with sync health, invocation counts |
| GET | `/api/admin/skills/metrics` | Aggregate skill metrics (invocations, ratings, users) |
| GET | `/api/admin/versions/health` | Version drift data per skill |
| POST | `/api/admin/versions/nudge` | Send update nudge to behind users |
| GET | `/api/admin/feedback` | Feedback list with filters |
| POST | `/api/admin/feedback/:id/status` | Update feedback triage status |
| GET | `/api/admin/activity` | Activity event feed |

All admin endpoints return 401 for unauthenticated requests and 403 for non-admin users.
```

### Inline Comments

All new files should include a module-level comment explaining their purpose. The API route files should document query parameters and response shapes in JSDoc comments above the handler functions.

---

## Stress Testing and Edge Cases

### Performance at Scale

- **User table with 20 users:** All queries are simple with small result sets. No pagination needed at this scale.
- **Skill invocations table growth:** With 38 skills x 20 users x ~10 invocations/day, the table grows by ~7,600 rows/month. Time-windowed queries use indexed `created_at` columns. At this growth rate, performance remains excellent for years.
- **Activity feed:** At ~100-200 events/day across 20 users, the activity table grows slowly. The LIMIT/OFFSET pagination handles this well. If growth accelerates, add cursor-based pagination in a future phase.

### Edge Cases

- **No users registered yet:** Team page shows empty table and funnel with all zeros. No division-by-zero in onboarding percent calculation (maxCount defaults to 1).
- **Skill with no invocations ever:** Shows 0 for all invocation columns. `isDead` is true. `averageRating` is null (displayed as a dash).
- **Skill with no versions in registry:** Version health page shows 0 users, 0% drift. No chart rendered. No nudge button.
- **User with no sync record:** syncStatus is "never", displayed as gray badge. Does not break sort operations (null sorts to bottom).
- **Concurrent feedback status updates:** Last-write-wins is acceptable at this scale. No optimistic locking needed.
- **Admin demotion:** Not implemented in this phase (only promotion). Admin can always access admin routes as long as `role = 'admin'` in the database.
- **All users on latest version:** Nudge button is hidden. driftPercent is 0. needsAttention is false.
- **Feedback with no rating (comment only):** averageRating calculation uses `WHERE rating IS NOT NULL`, so comment-only feedback does not skew the average. The feedback list shows the comment without a star rating.

### Error Scenarios

- **Database connection failure:** API routes should return 500 with a generic error message. The Next.js error boundary catches rendering failures.
- **Invalid sort parameter:** Falls through to default sort (no crash, just unexpected order). Could add validation in a future iteration.
- **Admin middleware race condition:** If a user is demoted between middleware check and route handler execution, the route still executes. Acceptable at this scale; the next request will be blocked.

---

## Verification Checklist

- [ ] `role` column added to `users` table with default `'user'`
- [ ] `activity_events` table created with correct schema
- [ ] `status` and `resolvedByVersionId` columns added to `skill_feedback` table
- [ ] Drizzle migration generated and applied
- [ ] First user automatically assigned admin role
- [ ] `ADMIN_GITHUB_USERNAME` env var works as override
- [ ] All `/admin/*` routes return 403 for non-admin users
- [ ] All `/api/admin/*` routes return 401 for unauthenticated, 403 for non-admin
- [ ] GET `/api/admin/users` returns correct sync status flags
- [ ] GET `/api/admin/skills/metrics` returns correct time-windowed counts
- [ ] GET `/api/admin/versions/health` returns correct drift percentages
- [ ] POST `/api/admin/versions/nudge` creates activity events
- [ ] GET `/api/admin/feedback` filters by status and sorts correctly
- [ ] POST `/api/admin/feedback/:id/status` updates status and logs event
- [ ] GET `/api/admin/activity` filters by type, user, skill
- [ ] Activity events logged in sync, feedback, publish, and token flows
- [ ] Admin link visible only to admin users in global nav
- [ ] All five admin pages render correctly with data
- [ ] All five admin pages render correctly with empty data (no crashes)
- [ ] `lucide-react` icons installed (or already present from Phase 01)
- [ ] All API tests pass
- [ ] All admin role tests pass
- [ ] README updated with admin dashboard documentation

---

## What NOT to Do

1. **Do NOT add skill editing capability to the dashboard.** The feedback triage page links to the Workshop (Phase 04) for editing. This phase is read-only views plus feedback status management.
2. **Do NOT add intelligence pipeline data to the activity feed.** That is Phase 06 scope. The `eventType` enum supports `'learning'` for future use, but do not implement the data source.
3. **Do NOT implement automated remediation.** The nudge action is a manual trigger. Do not auto-send nudges based on drift thresholds.
4. **Do NOT add real-time updates (WebSockets, SSE, polling).** The dashboard is refreshed on page load. Real-time updates are a future enhancement if needed.
5. **Do NOT use client-side data fetching libraries (SWR, React Query) in this phase.** Simple `fetch` in `useEffect` is sufficient for 20 users. Adding a data fetching library is unnecessary complexity.
6. **Do NOT implement pagination for the user or skills tables.** With 20 users and 38 skills, all data fits in a single page. Add pagination if the team grows beyond 100 users.
7. **Do NOT create a separate admin database or schema.** All admin queries use the same tables from Phases 01-03. The admin views are just aggregate queries over existing data plus the new `activity_events` table.
8. **Do NOT build a user management page (add/remove users, reset passwords).** Users self-register via GitHub OAuth. The only admin action on users is role promotion, which can be done via direct database update or a future admin settings page.
9. **Do NOT use `dangerouslySetInnerHTML` for feedback comments.** Feedback content from users is untrusted. Always render as text content, never as HTML.
10. **Do NOT add the `activity_events` insert calls to Phase 01/02/03 code yourself.** Those integration points are documented in Step 7. The implementer of this phase should coordinate with the implementers of those phases, or add the inserts if those phases have already landed.

---
