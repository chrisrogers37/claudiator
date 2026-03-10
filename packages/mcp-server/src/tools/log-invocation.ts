import { z } from "zod";
import type { DbClient } from "../lib/db.js";
import { skillInvocations } from "@claudiator/db/schema";

export const logInvocationSchema = z.object({
  skill_slug: z
    .string()
    .describe("The skill's directory name (e.g., 'session-handoff', 'product-enhance')"),
  session_id: z
    .string()
    .describe("Opaque session identifier from the Claude Code session"),
  success: z
    .boolean()
    .optional()
    .describe("Whether the skill completed successfully. Omit if unknown."),
  duration_ms: z
    .number()
    .int()
    .optional()
    .describe("How long the skill ran in milliseconds"),
});

export async function logInvocation(
  db: DbClient,
  user: { id: string },
  args: z.infer<typeof logInvocationSchema>
): Promise<{ content: { type: "text"; text: string }[] }> {
  // Fire-and-forget: insert without awaiting so telemetry never blocks the session
  db.insert(skillInvocations)
    .values({
      userId: user.id,
      skillSlug: args.skill_slug,
      sessionId: args.session_id,
      success: args.success ?? null,
      durationMs: args.duration_ms ?? null,
    })
    .catch((err: Error) => {
      console.error("[claudiator] telemetry error:", err.message);
    });

  return {
    content: [{ type: "text" as const, text: "Invocation logged." }],
  };
}
