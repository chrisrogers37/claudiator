import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { skillCategories } from "@claudiator/db/schema";
import { desc, eq } from "drizzle-orm";

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
      skillCount: skillCategories.skillCount,
      createdAt: skillCategories.createdAt,
    })
    .from(skillCategories);

  if (domain) {
    query.where(eq(skillCategories.domain, domain));
  }

  const items = await query.orderBy(desc(skillCategories.skillCount)).limit(100);

  return NextResponse.json(items);
}
