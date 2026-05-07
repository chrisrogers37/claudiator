import { NextResponse } from "next/server";
import { createDb } from "@claudosseum/db/client";
import { learnings } from "@claudosseum/db/schema";
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
    .orderBy(desc(learnings.distilledAt))
    .limit(100);

  return NextResponse.json(items);
}
