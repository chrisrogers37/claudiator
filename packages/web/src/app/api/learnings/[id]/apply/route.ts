import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { learningSkillLinks, learnings } from "@claudiator/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { skillSlug, action } = await request.json();

  if (!["applied", "rejected"].includes(action)) {
    return NextResponse.json(
      { error: 'action must be "applied" or "rejected"' },
      { status: 400 }
    );
  }

  // Read all link state before the transaction (neon-http batch transactions
  // don't support interactive reads, so we compute target state in JS first)
  const allLinks = await db
    .select({ skillSlug: learningSkillLinks.skillSlug, status: learningSkillLinks.status })
    .from(learningSkillLinks)
    .where(eq(learningSkillLinks.learningId, id));

  // Compute what the state will be after the update
  const updatedLinks = allLinks.map((link) =>
    link.skillSlug === skillSlug ? { ...link, status: action } : link
  );
  const hasPending = updatedLinks.some((l) => l.status === "pending");
  const hasApplied = updatedLinks.some((l) => l.status === "applied");

  // Atomically: update link status and (if all resolved) update learning status
  await db.transaction(async (tx) => {
    await tx
      .update(learningSkillLinks)
      .set({ status: action, updatedAt: new Date() })
      .where(
        and(
          eq(learningSkillLinks.learningId, id),
          eq(learningSkillLinks.skillSlug, skillSlug)
        )
      );

    if (!hasPending) {
      const newStatus = hasApplied ? "applied" : "dismissed";
      await tx
        .update(learnings)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(learnings.id, id));
    }
  });

  return NextResponse.json({ ok: true });
}
