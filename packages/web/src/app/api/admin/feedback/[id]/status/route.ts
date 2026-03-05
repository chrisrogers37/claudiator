import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudefather/db/client";
import { skillFeedback, activityEvents } from "@claudefather/db/schema";
import { eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

const VALID_STATUSES = [
  "new",
  "acknowledged",
  "in_progress",
  "resolved",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!(session as any)?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(session as any).isAdmin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  const { id: feedbackId } = await params;
  const body = await request.json();
  const { status, resolvedByVersionId } = body as {
    status: string;
    resolvedByVersionId?: string;
  };

  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      {
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Validate feedback exists
  const [existing] = await db
    .select()
    .from(skillFeedback)
    .where(eq(skillFeedback.id, feedbackId));

  if (!existing) {
    return NextResponse.json(
      { error: "Feedback not found" },
      { status: 404 }
    );
  }

  // Update status
  const updateData: Record<string, unknown> = { status };
  if (status === "resolved" && resolvedByVersionId) {
    updateData.resolvedByVersionId = resolvedByVersionId;
  }

  await db
    .update(skillFeedback)
    .set(updateData)
    .where(eq(skillFeedback.id, feedbackId));

  // Log activity event
  await db
    .insert(activityEvents)
    .values({
      userId: (session as any).userId,
      eventType: "feedback_status_change",
      details: {
        feedbackId,
        skillSlug: existing.skillSlug,
        oldStatus: existing.status,
        newStatus: status,
      },
    })
    .catch((err: Error) => {
      console.error(
        "[claudefather] feedback_status_change event error:",
        err.message
      );
    });

  return NextResponse.json({ success: true, feedbackId, status });
}
