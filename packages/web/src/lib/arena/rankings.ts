import type { Db } from "@claudiator/db/client";
import { arenaRankings, arenaEloHistory } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";

const K_FACTOR = 32;

function calculateElo(
  rating: number,
  opponentRating: number,
  outcome: 1 | 0 | 0.5
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
  return rating + K_FACTOR * (outcome - expected);
}

export async function updateRankings(
  db: Db,
  championSkillId: string,
  verdict: "champion_wins" | "challenger_wins" | "draw",
  battleId: string
): Promise<void> {
  // Get or create ranking for champion
  let [ranking] = await db
    .select()
    .from(arenaRankings)
    .where(eq(arenaRankings.skillId, championSkillId));

  if (!ranking) {
    [ranking] = await db
      .insert(arenaRankings)
      .values({ skillId: championSkillId })
      .returning();
  }

  // Challenger doesn't have a skill record yet, so use default 1200 ELO
  const challengerElo = 1200;
  const eloBefore = ranking.eloRating;
  const outcome: 1 | 0 | 0.5 =
    verdict === "champion_wins" ? 1 : verdict === "challenger_wins" ? 0 : 0.5;

  const eloAfter = calculateElo(ranking.eloRating, challengerElo, outcome);
  const eloChange = eloAfter - eloBefore;
  const newWins = ranking.wins + (verdict === "champion_wins" ? 1 : 0);
  const newLosses = ranking.losses + (verdict === "challenger_wins" ? 1 : 0);
  const newDraws = ranking.draws + (verdict === "draw" ? 1 : 0);
  const totalGames = newWins + newLosses + newDraws;
  const newWinRate = totalGames > 0 ? newWins / totalGames : 0;

  await db
    .update(arenaRankings)
    .set({
      wins: newWins,
      losses: newLosses,
      draws: newDraws,
      winRate: newWinRate,
      eloRating: eloAfter,
      title: assignTitle(newWins, newLosses, newDraws),
      lastBattleAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(arenaRankings.skillId, championSkillId));

  // Record ELO history
  const eloOutcome: "win" | "loss" | "draw" =
    verdict === "champion_wins" ? "win" : verdict === "challenger_wins" ? "loss" : "draw";

  await db.insert(arenaEloHistory).values({
    skillId: championSkillId,
    battleId,
    eloBefore,
    eloAfter,
    eloChange,
    opponentElo: challengerElo,
    outcome: eloOutcome,
  });
}

export function assignTitle(wins: number, losses: number, draws: number): string {
  const total = wins + losses + draws;
  if (total === 0) return "The Newcomer";
  if (losses === 0 && wins >= 3) return "The Undefeated";
  if (total >= 5 && wins / total >= 0.8) return "The Veteran";
  if (wins >= 1) return "The Contender";
  if (losses > wins) return "The Fallen";
  return "The Contender";
}
