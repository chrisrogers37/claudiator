import { describe, it, expect } from "vitest";
import { computeBumpType } from "../../check-updates";

describe("computeBumpType", () => {
  it('returns "MAJOR" for different major versions', () => {
    expect(computeBumpType("1.0.0", "2.0.0")).toBe("MAJOR");
    expect(computeBumpType("1.5.3", "3.0.0")).toBe("MAJOR");
  });

  it('returns "MINOR" for same major, different minor', () => {
    expect(computeBumpType("1.0.0", "1.1.0")).toBe("MINOR");
    expect(computeBumpType("2.3.0", "2.5.1")).toBe("MINOR");
  });

  it('returns "PATCH" for same major and minor', () => {
    expect(computeBumpType("1.0.0", "1.0.1")).toBe("PATCH");
    expect(computeBumpType("2.3.4", "2.3.9")).toBe("PATCH");
  });

  it("handles 0.x versions correctly", () => {
    expect(computeBumpType("0.1.0", "0.2.0")).toBe("MINOR");
    expect(computeBumpType("0.1.0", "0.1.1")).toBe("PATCH");
    expect(computeBumpType("0.1.0", "1.0.0")).toBe("MAJOR");
  });
});
