import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

// POST /api/skills/:slug/ai-edit — AI-assisted skill editing
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { content, instruction } = await request.json();

  if (typeof content !== "string" || typeof instruction !== "string") {
    return NextResponse.json(
      { error: "content and instruction must be strings" },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { slug } = await params;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: `You are a skill editor for Claude Code skills. You receive the current content of a SKILL.md file and an instruction from the maintainer. Your job is to apply the requested changes and return the complete modified SKILL.md content.

Rules:
- Return ONLY the modified SKILL.md content, nothing else
- Preserve the YAML frontmatter structure exactly
- Do not add explanations or commentary outside the SKILL.md content
- If the instruction is unclear, make your best judgment and apply the change
- Maintain the existing writing style and formatting conventions`,
      messages: [
        {
          role: "user",
          content: `Current SKILL.md content for "/${slug}":\n\n\`\`\`markdown\n${content}\n\`\`\`\n\nInstruction: ${instruction}`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Strip markdown code fences if the model wrapped the response
    const cleaned = responseText
      .replace(/^```(?:markdown)?\n/, "")
      .replace(/\n```$/, "");

    return NextResponse.json({ proposedContent: cleaned });
  } catch (error) {
    console.error("AI edit error:", error);
    return NextResponse.json({ error: "AI edit failed" }, { status: 500 });
  }
}
