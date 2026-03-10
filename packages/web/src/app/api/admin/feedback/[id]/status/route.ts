import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudiator/db/client";
import { skillFeedback, activityEvents } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

const validStatuses = ["new", "acknowledged", "in_progress", "resolved"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session as any).role;
  const userId = (session as any).userId;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await request.json();

  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  // Get the feedback item first for the activity event
  const [feedback] = await db
    .select({
      id: skillFeedback.id,
      skillSlug: skillFeedback.skillSlug,
      status: skillFeedback.status,
    })
    .from(skillFeedback)
    .where(eq(skillFeedback.id, id));

  if (!feedback) {
    return NextResponse.json(
      { error: "Feedback not found" },
      { status: 404 }
    );
  }

  await db
    .update(skillFeedback)
    .set({ status })
    .where(eq(skillFeedback.id, id));

  // Log the status change
  await db.insert(activityEvents).values({
    userId,
    eventType: "feedback_status_change",
    skillSlug: feedback.skillSlug,
    details: {
      feedbackId: id,
      fromStatus: feedback.status,
      toStatus: status,
    },
  });

  return NextResponse.json({ id, status });
}
