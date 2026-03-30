import { describe, it, expect } from "vitest";
import { assignTitle } from "../../rankings";

describe("assignTitle", () => {
  it('returns "The Newcomer" for zero games', () => {
    expect(assignTitle(0, 0, 0)).toBe("The Newcomer");
  });

  it('returns "The Undefeated" for 3+ wins and 0 losses', () => {
    expect(assignTitle(3, 0, 0)).toBe("The Undefeated");
    expect(assignTitle(10, 0, 0)).toBe("The Undefeated");
    expect(assignTitle(3, 0, 2)).toBe("The Undefeated");
  });

  it('does not return "The Undefeated" for 2 wins 0 losses (threshold is 3)', () => {
    expect(assignTitle(2, 0, 0)).not.toBe("The Undefeated");
  });

  it('returns "The Veteran" for 5+ games with 80%+ win rate', () => {
    expect(assignTitle(4, 1, 0)).toBe("The Veteran"); // 80% exactly
    expect(assignTitle(5, 1, 0)).toBe("The Veteran"); // 83%
  });

  it('prioritizes "The Undefeated" over "The Veteran" when both match', () => {
    // 5 wins, 0 losses = undefeated AND 100% win rate with 5+ games
    expect(assignTitle(5, 0, 0)).toBe("The Undefeated");
  });

  it('returns "The Contender" for at least 1 win', () => {
    expect(assignTitle(1, 0, 0)).toBe("The Contender");
    expect(assignTitle(2, 1, 0)).toBe("The Contender");
  });

  it('returns "The Fallen" when losses > wins', () => {
    expect(assignTitle(0, 3, 0)).toBe("The Fallen");
    expect(assignTitle(1, 3, 0)).toBe("The Fallen");
    expect(assignTitle(2, 5, 0)).toBe("The Fallen");
  });

  it('returns "The Contender" when losses equal wins (fallthrough)', () => {
    expect(assignTitle(1, 1, 0)).toBe("The Contender");
  });
});
