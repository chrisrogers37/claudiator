import { createDb } from "@claudiator/db/client";
import {
  sourceConfigs,
  intakeCandidates,
  battles,
  skills,
  skillCategories,
  arenaRankings,
  arenaLlmCalls,
} from "@claudiator/db/schema";
import { eq, desc, sql, and, count } from "drizzle-orm";
import { discoverSkillsFromRepo } from "../src/lib/pipeline/skill-discovery";
import { findNextMatch, createBattle } from "../src/lib/arena/matchmaker";
import { executeBattle } from "../src/lib/arena/executor";
import { getBattleDetail } from "../src/lib/arena/battle-queries";

// ─── Config ────────────────────────────────────────────────────────────────

const TARGET_REPOS = [
  { name: "gstack", url: "https://github.com/garrytan/gstack", sourceType: "github_skill_repo" as const },
  { name: "trailofbits-skills", url: "https://github.com/trailofbits/skills", sourceType: "github_skill_repo" as const },
  { name: "claude-skills", url: "https://github.com/alirezarezvani/claude-skills", sourceType: "github_skill_repo" as const },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const green = (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s);
const red = (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const cyan = (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s);
const dim = (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s);

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
  );
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const hdr = headers.map((h, i) => h.padEnd(widths[i])).join(" | ");
  const body = rows.map((r) => r.map((c, i) => (c || "").padEnd(widths[i])).join(" | "));
  return [hdr, sep, ...body].join("\n");
}

function elapsed(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

interface Args {
  command: string;
  repo?: string;
  limit?: number;
  yes: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { command: "status", yes: false };

  let i = 0;
  // First positional arg is the command
  if (argv[0] && !argv[0].startsWith("--")) {
    args.command = argv[0];
    i = 1;
  }

  for (; i < argv.length; i++) {
    if (argv[i] === "--repo" && argv[i + 1]) {
      args.repo = argv[++i];
    } else if (argv[i] === "--limit" && argv[i + 1]) {
      args.limit = parseInt(argv[++i], 10);
    } else if (argv[i] === "--yes" || argv[i] === "-y") {
      args.yes = true;
    }
  }

  return args;
}

// ─── Seed Source Configs ───────────────────────────────────────────────────

type Db = ReturnType<typeof createDb>;

async function seedSourceConfigs(
  db: Db,
  repoFilter?: string
): Promise<{ id: string; name: string; url: string }[]> {
  const repos = repoFilter
    ? TARGET_REPOS.filter((r) => r.name === repoFilter)
    : TARGET_REPOS;

  if (repos.length === 0) {
    console.error(red(`No repo found matching: ${repoFilter}`));
    console.error(`Available repos: ${TARGET_REPOS.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }

  for (const repo of repos) {
    await db
      .insert(sourceConfigs)
      .values({
        name: repo.name,
        url: repo.url,
        sourceType: repo.sourceType,
        checkFrequency: "daily",
        isActive: true,
        fetchConfig: {},
      })
      .onConflictDoUpdate({
        target: sourceConfigs.url,
        set: { name: repo.name, isActive: true },
      });
  }

  // Query back to get IDs
  const configs = await db
    .select({ id: sourceConfigs.id, name: sourceConfigs.name, url: sourceConfigs.url })
    .from(sourceConfigs)
    .where(
      repos.length === 1
        ? eq(sourceConfigs.url, repos[0].url)
        : sql`${sourceConfigs.url} IN (${sql.join(
            repos.map((r) => sql`${r.url}`),
            sql`, `
          )})`
    );

  return configs;
}

// ─── Commands ──────────────────────────────────────────────────────────────

async function runDiscover(db: Db, args: Args): Promise<void> {
  console.log(bold("\n=== Arena Discovery ===\n"));

  const configs = await seedSourceConfigs(db, args.repo);
  console.log(`Seeded ${configs.length} source config(s)\n`);

  let totalDiscovered = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const config of configs) {
    const repoName = config.url.replace("https://github.com/", "");
    console.log(bold(`--- Discovering: ${repoName} ---`));
    if (args.limit) console.log(dim(`  (limit: ${args.limit} skills)`));

    const start = Date.now();
    try {
      const result = await discoverSkillsFromRepo(db, config.url, config.id, args.limit);
      console.log(
        `  ${green(`${result.discovered} discovered`)}, ` +
          `${dim(`${result.skipped} skipped`)}, ` +
          `${result.errors.length > 0 ? red(`${result.errors.length} errors`) : "0 errors"} ` +
          `${dim(`(${elapsed(start)})`)}`
      );

      if (result.errors.length > 0) {
        for (const err of result.errors.slice(0, 5)) {
          console.log(`  ${red("ERR:")} ${err}`);
        }
        if (result.errors.length > 5) {
          console.log(dim(`  ... and ${result.errors.length - 5} more errors`));
        }
      }

      totalDiscovered += result.discovered;
      totalSkipped += result.skipped;
      totalErrors += result.errors.length;
    } catch (err: any) {
      console.log(`  ${red("FAILED:")} ${err.message}`);
      totalErrors++;
    }
    console.log();
  }

  console.log(bold("--- Discovery Summary ---"));
  console.log(
    `  ${green(`${totalDiscovered} discovered`)}, ` +
      `${dim(`${totalSkipped} skipped`)}, ` +
      `${totalErrors > 0 ? red(`${totalErrors} errors`) : "0 errors"}`
  );

  // Show LLM cost for this run
  const [costResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${arenaLlmCalls.costCents}), 0)` })
    .from(arenaLlmCalls);
  console.log(`  Total LLM cost so far: ${yellow(`$${(costResult.total / 100).toFixed(2)}`)}`);
}

async function runStatus(db: Db): Promise<void> {
  console.log(bold("\n=== Arena Status ===\n"));

  // 1. Source configs
  const configs = await db
    .select({
      name: sourceConfigs.name,
      url: sourceConfigs.url,
      lastCheckedAt: sourceConfigs.lastCheckedAt,
    })
    .from(sourceConfigs)
    .where(eq(sourceConfigs.isActive, true));

  if (configs.length > 0) {
    console.log(bold("Source Configs:"));
    console.log(
      formatTable(
        ["Name", "URL", "Last Checked"],
        configs.map((c) => [
          c.name,
          c.url.replace("https://github.com/", ""),
          c.lastCheckedAt?.toISOString().slice(0, 16) ?? "never",
        ])
      )
    );
    console.log();
  }

  // 2. Candidate counts by status
  const statusCounts = await db
    .select({
      status: intakeCandidates.status,
      count: count(),
    })
    .from(intakeCandidates)
    .groupBy(intakeCandidates.status)
    .orderBy(intakeCandidates.status);

  if (statusCounts.length > 0) {
    console.log(bold("Intake Candidates by Status:"));
    for (const row of statusCounts) {
      const color =
        row.status === "queued" ? green :
        row.status === "battling" ? yellow :
        row.status === "promoted" ? cyan :
        row.status === "rejected" ? red :
        dim;
      console.log(`  ${color(row.status.padEnd(14))} ${row.count}`);
    }
    console.log();
  } else {
    console.log(dim("No intake candidates yet.\n"));
  }

  // 3. Categories (live count via LEFT JOIN)
  const categories = await db
    .select({
      domain: skillCategories.domain,
      fn: skillCategories.function,
      slug: skillCategories.slug,
      skillCount: sql<number>`count(${skills.id})::int`,
    })
    .from(skillCategories)
    .leftJoin(skills, eq(skills.categoryId, skillCategories.id))
    .groupBy(skillCategories.id)
    .orderBy(desc(sql`count(${skills.id})`));

  if (categories.length > 0) {
    console.log(bold(`Categories (${categories.length}):`));
    console.log(
      formatTable(
        ["Domain", "Function", "Slug", "Skills"],
        categories.slice(0, 15).map((c) => [c.domain, c.fn, c.slug, String(c.skillCount)])
      )
    );
    if (categories.length > 15) console.log(dim(`  ... and ${categories.length - 15} more`));
    console.log();
  }

  // 4. Top queued candidates
  const queued = await db
    .select({
      id: intakeCandidates.id,
      sourceUrl: intakeCandidates.sourceUrl,
      fightScore: intakeCandidates.fightScore,
      purpose: intakeCandidates.extractedPurpose,
      categoryDomain: skillCategories.domain,
      categoryFn: skillCategories.function,
      championName: skills.name,
    })
    .from(intakeCandidates)
    .leftJoin(skillCategories, eq(intakeCandidates.categoryId, skillCategories.id))
    .leftJoin(skills, eq(intakeCandidates.matchedChampionSkillId, skills.id))
    .where(eq(intakeCandidates.status, "queued"))
    .orderBy(desc(intakeCandidates.fightScore))
    .limit(10);

  if (queued.length > 0) {
    console.log(bold("Top Queued Candidates (ready to battle):"));
    console.log(
      formatTable(
        ["Score", "Category", "Champion", "Source"],
        queued.map((q) => [
          String(q.fightScore ?? "?"),
          q.categoryDomain && q.categoryFn ? `${q.categoryDomain}/${q.categoryFn}` : "?",
          q.championName ?? "(none)",
          q.sourceUrl?.replace("https://github.com/", "").replace("/blob/HEAD/", " > ") ?? "?",
        ])
      )
    );
    console.log();
  }

  // 5. Recent battles
  const recentBattles = await db
    .select({
      id: battles.id,
      status: battles.status,
      verdict: battles.verdict,
      championScore: battles.championScore,
      challengerScore: battles.challengerScore,
      championName: skills.name,
      completedAt: battles.completedAt,
    })
    .from(battles)
    .innerJoin(skills, eq(battles.championSkillId, skills.id))
    .orderBy(desc(battles.createdAt))
    .limit(5);

  if (recentBattles.length > 0) {
    console.log(bold("Recent Battles:"));
    console.log(
      formatTable(
        ["Status", "Verdict", "Champion", "Scores", "Completed"],
        recentBattles.map((b) => [
          b.status,
          b.verdict ?? "-",
          b.championName,
          b.championScore != null ? `${b.championScore} vs ${b.challengerScore}` : "-",
          b.completedAt?.toISOString().slice(0, 16) ?? "-",
        ])
      )
    );
    console.log();
  }

  // 6. Rankings leaderboard
  const rankings = await db
    .select({
      skillName: skills.name,
      eloRating: arenaRankings.eloRating,
      title: arenaRankings.title,
      wins: arenaRankings.wins,
      losses: arenaRankings.losses,
      draws: arenaRankings.draws,
      categoryDomain: skillCategories.domain,
      categoryFn: skillCategories.function,
    })
    .from(arenaRankings)
    .innerJoin(skills, eq(arenaRankings.skillId, skills.id))
    .leftJoin(skillCategories, eq(arenaRankings.categoryId, skillCategories.id))
    .orderBy(desc(arenaRankings.eloRating))
    .limit(10);

  if (rankings.length > 0) {
    console.log(bold("Rankings Leaderboard:"));
    console.log(
      formatTable(
        ["Skill", "ELO", "Title", "W/L/D", "Category"],
        rankings.map((r) => [
          r.skillName,
          String(Math.round(r.eloRating)),
          r.title ?? "-",
          `${r.wins}/${r.losses}/${r.draws}`,
          r.categoryDomain && r.categoryFn ? `${r.categoryDomain}/${r.categoryFn}` : "-",
        ])
      )
    );
    console.log();
  }

  // Cost summary
  const [costResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${arenaLlmCalls.costCents}), 0)` })
    .from(arenaLlmCalls);
  console.log(dim(`Total LLM cost: $${(costResult.total / 100).toFixed(2)}`));
}

async function runBattle(db: Db): Promise<void> {
  console.log(bold("\n=== Arena Battle ===\n"));

  const match = await findNextMatch(db);
  if (!match) {
    console.log(yellow("No queued candidates with matched champions available."));
    console.log(dim("Run 'discover' first to ingest candidates, or check 'status' for current state."));
    return;
  }

  // Get details for display
  const [candidate] = await db
    .select({
      sourceUrl: intakeCandidates.sourceUrl,
      fightScore: intakeCandidates.fightScore,
      purpose: intakeCandidates.extractedPurpose,
    })
    .from(intakeCandidates)
    .where(eq(intakeCandidates.id, match.candidateId));

  const [champion] = await db
    .select({ name: skills.name, slug: skills.slug })
    .from(skills)
    .where(eq(skills.id, match.championSkillId));

  const repoPath = candidate.sourceUrl?.replace("https://github.com/", "").replace("/blob/HEAD/", " > ") ?? "?";
  console.log(`Challenger: ${cyan(repoPath)}`);
  console.log(`  Purpose:  ${candidate.purpose ?? "?"}`);
  console.log(`  Score:    ${candidate.fightScore ?? "?"}/100`);
  console.log(`Champion:   ${yellow(champion.name)} (${champion.slug})`);
  console.log();

  // Create and execute
  const start = Date.now();
  console.log("Creating battle...");
  const battleId = await createBattle(db, match.candidateId, match.championSkillId, match.championVersionId);

  console.log(`Executing battle ${dim(battleId)}...`);
  console.log(dim("(generating scenarios, executing skills, judging rounds — this takes a minute)"));
  console.log();

  await executeBattle(db, battleId);

  // Get results
  const detail = await getBattleDetail(db, battleId);
  if (!detail) {
    console.log(red("Battle completed but could not load details."));
    return;
  }

  // Print result
  const verdictColor =
    detail.verdict === "champion_wins" ? yellow :
    detail.verdict === "challenger_wins" ? green :
    dim;

  console.log(bold("--- Battle Result ---"));
  console.log(`  Verdict:    ${verdictColor(detail.verdict ?? "unknown")}`);
  console.log(`  Champion:   ${detail.championScore ?? "?"}/100`);
  console.log(`  Challenger: ${detail.challengerScore ?? "?"}/100`);
  console.log(`  Duration:   ${elapsed(start)}`);

  // Per-scenario breakdown
  if (detail.scenarios.length > 0) {
    console.log();
    console.log(bold("  Scenarios:"));
    for (const scenario of detail.scenarios) {
      const difficulty = scenario.difficulty ?? "?";
      console.log(`    ${difficulty.padEnd(8)} ${dim(scenario.description?.slice(0, 80) ?? "")}`);
      for (const round of scenario.rounds) {
        const wins = round.judgments.filter((j) => j.winnerId === "champion").length;
        const losses = round.judgments.filter((j) => j.winnerId === "challenger").length;
        const draws = round.judgments.filter((j) => j.winnerId === "draw").length;
        console.log(`             Judges: ${yellow(`Champion ${wins}`)} / ${green(`Challenger ${losses}`)} / ${dim(`Draw ${draws}`)}`);
      }
    }
  }

  // Cost for this battle
  const [battleCost] = await db
    .select({ total: sql<number>`COALESCE(SUM(${arenaLlmCalls.costCents}), 0)` })
    .from(arenaLlmCalls)
    .where(eq(arenaLlmCalls.battleId, battleId));
  console.log(`\n  Battle cost: ${yellow(`$${(battleCost.total / 100).toFixed(2)}`)}`);
}

async function runFull(db: Db, args: Args): Promise<void> {
  await runDiscover(db, args);
  await runStatus(db);

  console.log(bold("\n=== Running Battles ===\n"));

  let battleCount = 0;
  while (true) {
    const match = await findNextMatch(db);
    if (!match) {
      console.log(dim("\nNo more matches available."));
      break;
    }

    battleCount++;
    console.log(bold(`\n--- Battle #${battleCount} ---`));
    await runBattle(db);
  }

  if (battleCount > 0) {
    console.log(bold(`\nCompleted ${battleCount} battle(s).`));
  }

  await runStatus(db);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(red("DATABASE_URL is required."));
    console.error("Usage: pnpm arena-test [discover|status|battle|full] [--repo name] [--limit n]");
    process.exit(1);
  }

  if (!databaseUrl.includes("arena-test") && !databaseUrl.includes("/test")) {
    console.warn(yellow("WARNING: DATABASE_URL does not appear to point to a test branch."));
    console.warn("Consider: neonctl branches create --name arena-test");
    console.warn();
  }

  const db = createDb(databaseUrl);
  const args = parseArgs();

  console.log(dim(`Command: ${args.command}${args.repo ? ` --repo ${args.repo}` : ""}${args.limit ? ` --limit ${args.limit}` : ""}`));

  switch (args.command) {
    case "discover":
      await runDiscover(db, args);
      break;
    case "status":
      await runStatus(db);
      break;
    case "battle":
      await runBattle(db);
      break;
    case "full":
      await runFull(db, args);
      break;
    default:
      console.error(red(`Unknown command: ${args.command}`));
      console.error("Commands: discover, status, battle, full");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(red("Arena test failed:"), err);
  process.exit(1);
});
