/**
 * Extract a display name from an intake candidate's raw content.
 * Parses YAML frontmatter for the `name` field, with fallbacks.
 */
export function extractChallengerName(
  rawContent: string,
  extractedPurpose?: string | null,
  fallback: string = "unknown"
): string {
  // Try parsing YAML frontmatter (between --- delimiters)
  const fmMatch = rawContent.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const nameMatch = fmMatch[1].match(/^name:\s*["']?(.+?)["']?\s*$/m);
    if (nameMatch?.[1]) return nameMatch[1];
  }

  // Fallback to extracted purpose (truncated)
  if (extractedPurpose) return extractedPurpose.slice(0, 40);

  return fallback;
}
