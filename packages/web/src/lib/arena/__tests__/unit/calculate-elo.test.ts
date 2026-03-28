import { describe, it, expect } from "vitest";
import { calculateElo } from "../../rankings";

describe("calculateElo", () => {
  it("increases rating on win against equal opponent", () => {
    const newRating = calculateElo(1200, 1200, 1);
    expect(newRating).toBeGreaterThan(1200);
  });

  it("decreases rating on loss against equal opponent", () => {
    const newRating = calculateElo(1200, 1200, 0);
    expect(newRating).toBeLessThan(1200);
  });

  it("returns near-unchanged rating on draw against equal opponent", () => {
    const newRating = calculateElo(1200, 1200, 0.5);
    expect(newRating).toBe(1200);
  });

  it("uses K-factor of 32: win vs equal = 1216", () => {
    // expected = 1 / (1 + 10^0) = 0.5
    // new = 1200 + 32 * (1 - 0.5) = 1216
    expect(calculateElo(1200, 1200, 1)).toBe(1216);
  });

  it("gains more for beating a higher-rated opponent", () => {
    const gainVsHigher = calculateElo(1200, 1400, 1) - 1200;
    const gainVsEqual = calculateElo(1200, 1200, 1) - 1200;
    expect(gainVsHigher).toBeGreaterThan(gainVsEqual);
  });

  it("gains less for beating a lower-rated opponent", () => {
    const gainVsLower = calculateElo(1200, 1000, 1) - 1200;
    const gainVsEqual = calculateElo(1200, 1200, 1) - 1200;
    expect(gainVsLower).toBeLessThan(gainVsEqual);
  });

  it("handles extreme rating differences", () => {
    // 400-point gap: expected win for higher-rated is ~0.91
    const newRating = calculateElo(1600, 1200, 1);
    expect(newRating).toBeGreaterThan(1600);
    expect(newRating).toBeLessThan(1632); // can't gain more than K
  });
});
