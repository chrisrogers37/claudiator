import { describe, it, expect } from "vitest";
import { aggregateJudgments, type JudgmentResult } from "../../judges";

function judgment(
  winner: "champion" | "challenger" | "draw",
  championTotal: number,
  challengerTotal: number
): JudgmentResult {
  return {
    winner,
    scores: {
      champion: { accuracy: 0, completeness: 0, style: 0, efficiency: 0, total: championTotal },
      challenger: { accuracy: 0, completeness: 0, style: 0, efficiency: 0, total: challengerTotal },
    },
    reasoning: "test",
    confidence: 0.9,
  };
}

describe("aggregateJudgments", () => {
  it("returns champion_wins when champion has majority", () => {
    const result = aggregateJudgments([
      judgment("champion", 80, 60),
      judgment("champion", 85, 55),
      judgment("challenger", 60, 75),
    ]);
    expect(result.verdict).toBe("champion_wins");
  });

  it("returns challenger_wins when challenger has majority", () => {
    const result = aggregateJudgments([
      judgment("challenger", 60, 80),
      judgment("challenger", 55, 85),
      judgment("champion", 75, 60),
    ]);
    expect(result.verdict).toBe("challenger_wins");
  });

  it("returns draw when wins are equal", () => {
    const result = aggregateJudgments([
      judgment("champion", 80, 60),
      judgment("challenger", 60, 80),
      judgment("draw", 70, 70),
    ]);
    expect(result.verdict).toBe("draw");
  });

  it("averages scores across all judgments", () => {
    const result = aggregateJudgments([
      judgment("champion", 80, 60),
      judgment("champion", 90, 50),
    ]);
    expect(result.championScore).toBe(85);
    expect(result.challengerScore).toBe(55);
  });

  it("handles single judgment", () => {
    const result = aggregateJudgments([judgment("challenger", 50, 90)]);
    expect(result.verdict).toBe("challenger_wins");
    expect(result.championScore).toBe(50);
    expect(result.challengerScore).toBe(90);
  });

  it("handles empty array without dividing by zero", () => {
    const result = aggregateJudgments([]);
    expect(result.verdict).toBe("draw");
    expect(result.championScore).toBe(0);
    expect(result.challengerScore).toBe(0);
  });

  it("handles all-draw judgments", () => {
    const result = aggregateJudgments([
      judgment("draw", 70, 70),
      judgment("draw", 75, 75),
      judgment("draw", 65, 65),
    ]);
    expect(result.verdict).toBe("draw");
    expect(result.championScore).toBe(70);
    expect(result.challengerScore).toBe(70);
  });
});
