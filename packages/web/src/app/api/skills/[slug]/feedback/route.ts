import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { skillFeedback } from "@claudiator/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const entries = await db
    .select()
    .from(skillFeedback)
    .where(eq(skillFeedback.skillSlug, slug))
    .orderBy(desc(skillFeedback.createdAt));

  return NextResponse.json(entries);
}
