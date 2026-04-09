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

export interface TreeEntry {
  path: string;
  sha: string;
  type: string;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function filterSkillFiles(tree: TreeEntry[]): TreeEntry[] {
  return tree.filter((f) => {
    if (f.type !== "blob") return false;
    const lower = f.path.toLowerCase();
    if (lower.includes("node_modules/") || lower.includes(".git/") || lower.includes("dist/") || lower.includes("build/")) return false;
    return lower.endsWith("/skill.md") || lower === "skill.md";
  });
}

// TODO(dev-gate): categoryId filter is a development convenience for testing
// single-category pipelines. Remove or promote to a first-class feature once
// the arena supports multi-category workflows.
export async function discoverSkillsFromRepo(
  db: Db,
  repoUrl: string,
  sourceConfigId: string,
  limit?: number,
  categoryId?: string
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { discovered: 0, skipped: 0, errors: [] };

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    result.errors.push(`Invalid GitHub URL: ${repoUrl}`);
    return result;
  }
  const { owner, repo: rawRepo } = parsed;
  const repo = rawRepo.replace(/\.git$/, "");

  // Fetch repo tree
  let tree: TreeEntry[];
  try {
    tree = await fetchGitHubRepoTree(owner, repo);
  } catch (err: any) {
    result.errors.push(`Failed to fetch repo tree: ${err.message}`);
    return result;
  }

  const skillFiles = filterSkillFiles(tree);
  const filesToProcess = limit ? skillFiles.slice(0, limit) : skillFiles;

  console.log(`[discovery] Found ${skillFiles.length} SKILL.md files in ${owner}/${repo}${limit ? ` (processing ${filesToProcess.length})` : ""}`);

  for (const file of filesToProcess) {
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
      content = await fetchGitHubBlob(owner, repo, file.sha);
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

      // Category scoping: dismiss candidates that don't match the target category
      if (categoryId) {
        const [cat] = await db
          .select({ categoryId: intakeCandidates.categoryId })
          .from(intakeCandidates)
          .where(eq(intakeCandidates.id, candidate.id));
        if (cat?.categoryId !== categoryId) {
          await db
            .update(intakeCandidates)
            .set({ status: "dismissed", updatedAt: new Date() })
            .where(eq(intakeCandidates.id, candidate.id));
          result.skipped++;
          continue;
        }
      }

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
