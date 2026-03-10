import { NextResponse } from "next/server";
import { validateToken } from "@claudiator/db/auth";
import { createDb } from "@claudiator/db/client";
import { users, apiTokens } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const validated = await validateToken(db, token);
  if (!validated) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, validated.userId));

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [tokenRecord] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, validated.tokenId));

  return NextResponse.json({
    githubUsername: user.githubUsername,
    displayName: user.displayName,
    role: user.role,
    tokenName: tokenRecord?.name || "unknown",
    tokenExpiresAt: tokenRecord?.expiresAt?.toISOString() || null,
  });
}
