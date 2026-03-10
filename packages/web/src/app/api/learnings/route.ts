import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { learnings } from "@claudiator/db/schema";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await db
    .select()
    .from(learnings)
    .orderBy(desc(learnings.distilledAt));

  return NextResponse.json(items);
}
