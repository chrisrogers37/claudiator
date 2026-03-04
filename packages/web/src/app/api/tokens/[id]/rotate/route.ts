import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rotateToken } from "@/lib/tokens";

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

  return NextResponse.json(result, { status: 201 });
}
