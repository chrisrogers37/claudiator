import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { skillCategories, skills } from "@claudiator/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  if (process.env.ARENA_ENABLED === "false") {
    return NextResponse.json({ error: "Arena disabled" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");

  const query = db
    .select({
      id: skillCategories.id,
      domain: skillCategories.domain,
      function: skillCategories.function,
      description: skillCategories.description,
      slug: skillCategories.slug,
      skillCount: sql<number>`count(${skills.id})::int`,
      createdAt: skillCategories.createdAt,
    })
    .from(skillCategories)
    .leftJoin(skills, eq(skills.categoryId, skillCategories.id))
    .groupBy(skillCategories.id);

  if (domain) {
    query.where(eq(skillCategories.domain, domain));
  }

  const items = await query.orderBy(desc(sql`count(${skills.id})`)).limit(100);

  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const session = await auth();
  if ((session as any)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { domain, fn, description, scoringRubric } = body;

  if (!domain || !fn) {
    return NextResponse.json({ error: "domain and fn required" }, { status: 400 });
  }

  if (scoringRubric) {
    if (!scoringRubric.dimensions || scoringRubric.dimensions.length !== 4) {
      return NextResponse.json(
        { error: "Rubric must have exactly 4 dimensions" },
        { status: 400 }
      );
    }
    for (const d of scoringRubric.dimensions) {
      if (!d.key || !d.label || !d.description || d.maxScore !== 25) {
        return NextResponse.json(
          { error: "Each dimension needs key, label, description, and maxScore=25" },
          { status: 400 }
        );
      }
    }
  }

  const slug = `${domain}-${fn}`;

  const [category] = await db
    .insert(skillCategories)
    .values({
      domain,
      function: fn,
      slug,
      description: description ?? null,
      scoringRubric: scoringRubric ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!category) {
    const [existing] = await db
      .select()
      .from(skillCategories)
      .where(eq(skillCategories.slug, slug));
    return NextResponse.json(existing);
  }

  return NextResponse.json(category, { status: 201 });
}
