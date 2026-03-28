import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateToken } from "@/lib/tokens";
import { createDb } from "@claudiator/db/client";
import { apiTokens } from "@claudiator/db/schema";
import { eq, desc } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// GET /api/tokens — list all tokens for the current user
export async function GET() {
  const session = await auth();
  if (!(session as any)?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.tokenPrefix,
      expiresAt: apiTokens.expiresAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
      totalCalls: apiTokens.totalCalls,
      successfulCalls: apiTokens.successfulCalls,
      failedCalls: apiTokens.failedCalls,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, (session as any).userId))
    .orderBy(desc(apiTokens.createdAt))
    .limit(100);

  return NextResponse.json(tokens);
}

// POST /api/tokens — generate a new token
export async function POST(request: Request) {
  const session = await auth();
  if (!(session as any)?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, expiresInDays } = body;

  if (!name || typeof name !== "string" || name.length > 64) {
    return NextResponse.json(
      { error: "Name is required and must be <= 64 characters" },
      { status: 400 }
    );
  }

  const validExpiry = [14, 30, 90, 365, null];
  if (!validExpiry.includes(expiresInDays)) {
    return NextResponse.json(
      { error: "expiresInDays must be 14, 30, 90, 365, or null (no expiry)" },
      { status: 400 }
    );
  }

  const result = await generateToken(
    (session as any).userId,
    name,
    expiresInDays
  );

  return NextResponse.json(result, { status: 201 });
}
