import { describe, it, expect } from "vitest";
import { shouldEvolve } from "../../evolution";

describe("shouldEvolve", () => {
  it("returns true when challenger wins (any score diff)", () => {
    expect(shouldEvolve(90, 50, "challenger_wins")).toBe(true);
  });

  it("returns true when scores are within 10 points (champion wins)", () => {
    expect(shouldEvolve(80, 75, "champion_wins")).toBe(true);
  });

  it("returns false when champion wins by more than 10 points", () => {
    expect(shouldEvolve(90, 70, "champion_wins")).toBe(false);
  });

  it("returns true at exact boundary (diff === 10)", () => {
    expect(shouldEvolve(80, 70, "champion_wins")).toBe(true);
  });

  it("returns false at diff === 11", () => {
    expect(shouldEvolve(81, 70, "champion_wins")).toBe(false);
  });

  it("returns true for draw verdict with close scores", () => {
    expect(shouldEvolve(75, 75, "draw")).toBe(true);
  });
});
