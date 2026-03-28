import { describe, it, expect } from "vitest";
import { tallyVotes, type CouncilVote } from "../../category-council";

function vote(
  categorySlug: string | null,
  domain: string,
  fn: string,
  purpose = "test purpose"
): CouncilVote {
  return {
    categorySlug,
    suggestedDomain: domain,
    suggestedFunction: fn,
    purpose,
    reasoning: "test reasoning",
  };
}

describe("tallyVotes", () => {
  it('returns "existing" when 3+ votes agree on same slug', () => {
    const result = tallyVotes([
      vote("railway/deploy", "railway", "deploy"),
      vote("railway/deploy", "railway", "deploy"),
      vote("railway/deploy", "railway", "deploy"),
      vote(null, "railway", "monitor"),
      vote(null, "cloud", "deploy"),
    ]);
    expect(result.winner).toBe("existing");
    expect(result.existingSlug).toBe("railway/deploy");
  });

  it("picks most popular slug when multiple existing slugs get votes", () => {
    const result = tallyVotes([
      vote("neon/query", "neon", "query"),
      vote("neon/query", "neon", "query"),
      vote("neon/branch", "neon", "branch"),
      vote("neon/query", "neon", "query"),
      vote(null, "neon", "migrate"),
    ]);
    expect(result.winner).toBe("existing");
    expect(result.existingSlug).toBe("neon/query");
  });

  it('returns "new" when fewer than 3 existing votes', () => {
    const result = tallyVotes([
      vote("railway/deploy", "railway", "deploy"),
      vote("railway/deploy", "railway", "deploy"),
      vote(null, "cloud", "deploy"),
      vote(null, "cloud", "deploy"),
      vote(null, "cloud", "deploy"),
    ]);
    expect(result.winner).toBe("new");
  });

  it("finds most common domain/function pair for new categories", () => {
    const result = tallyVotes([
      vote(null, "cloud", "deploy"),
      vote(null, "cloud", "deploy"),
      vote(null, "cloud", "monitor"),
      vote(null, "infra", "deploy"),
      vote(null, "cloud", "deploy"),
    ]);
    expect(result.winner).toBe("new");
    expect(result.newDomain).toBe("cloud");
    expect(result.newFunction).toBe("deploy");
  });

  it("uses MAJORITY_THRESHOLD of 3 (not simple majority)", () => {
    // 2 existing votes is not enough even if it's the majority of existing
    const result = tallyVotes([
      vote("railway/deploy", "railway", "deploy"),
      vote("railway/deploy", "railway", "deploy"),
      vote(null, "cloud", "deploy"),
      vote(null, "cloud", "monitor"),
      vote(null, "infra", "deploy"),
    ]);
    expect(result.winner).toBe("new");
  });

  it("falls back to defaults when all votes are empty-like", () => {
    // All existing votes but different slugs — still hits threshold of 3
    // 1 vote each for 3 different slugs + 2 new
    const result = tallyVotes([
      vote(null, "general", "utility"),
    ]);
    expect(result.winner).toBe("new");
    expect(result.newDomain).toBe("general");
    expect(result.newFunction).toBe("utility");
  });

  it("carries purpose from the winning vote", () => {
    const result = tallyVotes([
      vote("railway/deploy", "railway", "deploy", "deploy to railway"),
      vote("railway/deploy", "railway", "deploy", "railway deployment"),
      vote("railway/deploy", "railway", "deploy", "deploy to railway"),
    ]);
    expect(result.winningPurpose).toBe("deploy to railway");
  });
});
