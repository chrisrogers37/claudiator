import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rotateToken } from "@/lib/tokens";
import { createDb } from "@claudefather/db/client";
import { activityEvents } from "@claudefather/db/schema";

// POST /api/tokens/:id/rotate — revoke old token, generate new one
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!(session as any)?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await rotateToken(id, (session as any).userId);
  if (!result) {
    return NextResponse.json(
      { error: "Token not found, already revoked, or does not belong to you" },
      { status: 404 }
    );
  }

  // Log token_rotate activity event (fire-and-forget)
  const db = createDb(process.env.DATABASE_URL!);
  db.insert(activityEvents)
    .values({
      userId: (session as any).userId,
      eventType: "token_rotate",
      details: { tokenId: id },
    })
    .catch((err: Error) => {
      console.error("[claudefather] token_rotate event error:", err.message);
    });

  return NextResponse.json(result, { status: 201 });
}
