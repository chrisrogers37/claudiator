import { describe, it, expect } from "vitest";
import { calculateCostCents } from "../../costs";

describe("calculateCostCents", () => {
  it("calculates Haiku cost correctly", () => {
    // 1000 input @ $1/M = $0.001, 500 output @ $5/M = $0.0025
    // total = $0.0035 = 0.35 cents
    expect(calculateCostCents("claude-haiku-4-5-20251001", 1000, 500)).toBeCloseTo(0.35);
  });

  it("calculates Sonnet cost correctly", () => {
    // 1000 input @ $3/M = $0.003, 500 output @ $15/M = $0.0075
    // total = $0.0105 = 1.05 cents
    expect(calculateCostCents("claude-sonnet-4-20250514", 1000, 500)).toBeCloseTo(1.05);
  });

  it("uses default (Sonnet-level) pricing for unknown models", () => {
    const unknown = calculateCostCents("unknown-model", 1000, 500);
    const sonnet = calculateCostCents("claude-sonnet-4-20250514", 1000, 500);
    expect(unknown).toBe(sonnet);
  });

  it("returns 0 for zero tokens", () => {
    expect(calculateCostCents("claude-haiku-4-5-20251001", 0, 0)).toBe(0);
  });

  it("handles large token counts", () => {
    // 1M input @ $1/M = $1.00, 1M output @ $5/M = $5.00 = $6.00 = 600 cents
    expect(calculateCostCents("claude-haiku-4-5-20251001", 1_000_000, 1_000_000)).toBeCloseTo(600);
  });
});
