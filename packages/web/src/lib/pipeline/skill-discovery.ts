import type { Db } from "@claudiator/db/client";
import { intakeCandidates, sourceConfigs } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { fetchGitHubRepoTree, fetchGitHubBlob } from "./fetchers";
import { categorizeCandidate, scoreFightWorthiness, deduplicateCandidate } from "../arena/intake";

interface DiscoveryResult {
  discovered: number;
  skipped: number;
  errors: string[];
}

export async function discoverSkillsFromRepo(
  db: Db,
  repoUrl: string,
  sourceConfigId: string
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { discovered: 0, skipped: 0, errors: [] };

  // Parse owner/repo from URL
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    result.errors.push(`Invalid GitHub URL: ${repoUrl}`);
    return result;
  }
  const [, owner, repo] = match;

  // Fetch repo tree
  let tree: { path: string; sha: string; type: string }[];
  try {
    tree = await fetchGitHubRepoTree(owner, repo.replace(/\.git$/, ""));
  } catch (err: any) {
    result.errors.push(`Failed to fetch repo tree: ${err.message}`);
    return result;
  }

  // Find SKILL.md files (case-insensitive) — ignore node_modules, .git, dist, build
  const skillFiles = tree.filter((f) => {
    if (f.type !== "blob") return false;
    const lower = f.path.toLowerCase();
    if (lower.includes("node_modules/") || lower.includes(".git/") || lower.includes("dist/") || lower.includes("build/")) return false;
    return lower.endsWith("/skill.md") || lower === "skill.md";
  });

  console.log(`[discovery] Found ${skillFiles.length} SKILL.md files in ${owner}/${repo}`);

  for (const file of skillFiles) {
    const sourceUrl = `https://github.com/${owner}/${repo}/blob/HEAD/${file.path}`;

    // Deduplicate
    const isDupe = await deduplicateCandidate(db, sourceUrl);
    if (isDupe) {
      result.skipped++;
      continue;
    }

    // Fetch content
    let content: string;
    try {
      content = await fetchGitHubBlob(owner, repo.replace(/\.git$/, ""), file.sha);
    } catch (err: any) {
      result.errors.push(`Failed to fetch ${file.path}: ${err.message}`);
      continue;
    }

    if (!content || content.length < 50) {
      result.skipped++;
      continue;
    }

    // Create intake candidate
    const [candidate] = await db
      .insert(intakeCandidates)
      .values({
        sourceType: "github_skill",
        sourceUrl,
        rawContent: content,
        metadata: { repoOwner: owner, repoName: repo, filePath: file.path, sourceConfigId },
      })
      .returning({ id: intakeCandidates.id });

    // Auto-process: categorize -> score -> auto-queue if worthy
    try {
      await categorizeCandidate(db, candidate.id);
      await scoreFightWorthiness(db, candidate.id);

      // Auto-queue if fight score >= 50
      const [scored] = await db
        .select({ fightScore: intakeCandidates.fightScore })
        .from(intakeCandidates)
        .where(eq(intakeCandidates.id, candidate.id));

      if (scored?.fightScore && scored.fightScore >= 50) {
        await db
          .update(intakeCandidates)
          .set({ status: "queued", updatedAt: new Date() })
          .where(eq(intakeCandidates.id, candidate.id));
      }

      result.discovered++;
    } catch (err: any) {
      result.errors.push(`Failed to process ${file.path}: ${err.message}`);
    }
  }

  // Update source lastCheckedAt
  await db
    .update(sourceConfigs)
    .set({ lastCheckedAt: new Date() })
    .where(eq(sourceConfigs.id, sourceConfigId));

  console.log(`[discovery] Repo ${owner}/${repo}: ${result.discovered} discovered, ${result.skipped} skipped, ${result.errors.length} errors`);
  return result;
}
