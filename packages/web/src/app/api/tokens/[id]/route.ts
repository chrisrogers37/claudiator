import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeToken } from "@/lib/tokens";

// DELETE /api/tokens/:id — revoke a token
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!(session as any)?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const revoked = await revokeToken(id, (session as any).userId);
  if (!revoked) {
    return NextResponse.json(
      { error: "Token not found or already revoked" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
