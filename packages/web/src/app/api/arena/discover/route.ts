import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudiator/db/client";
import { sourceConfigs } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { discoverSkillsFromRepo } from "@/lib/pipeline/skill-discovery";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  const session = await auth();
  if (!session || (session as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  // Optional: scope discovery to a specific category (dev gate for single-category testing)
  const categoryId: string | undefined = body.categoryId;

  if (body.sourceConfigId) {
    const [source] = await db.select().from(sourceConfigs).where(eq(sourceConfigs.id, body.sourceConfigId));
    if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
    const result = await discoverSkillsFromRepo(db, source.url, source.id, undefined, categoryId);
    return NextResponse.json(result);
  }

  if (body.repoUrl) {
    const result = await discoverSkillsFromRepo(db, body.repoUrl, "manual", undefined, categoryId);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Provide sourceConfigId or repoUrl" }, { status: 400 });
}
