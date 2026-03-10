import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { runQualityControl } from "@/lib/pipeline/quality-control";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createDb(process.env.DATABASE_URL!);
    const result = await runQualityControl(db);

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[pipeline] Maintenance job failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
