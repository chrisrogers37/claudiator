import { describe, it, expect } from "vitest";
import { bumpVersion } from "../../publish";

describe("bumpVersion", () => {
  it("bumps patch: 1.2.3 -> 1.2.4", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
  });

  it("bumps minor: 1.2.3 -> 1.3.0", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  });

  it("bumps major: 1.2.3 -> 2.0.0", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  it("handles 0.x versions", () => {
    expect(bumpVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(bumpVersion("0.1.0", "minor")).toBe("0.2.0");
    expect(bumpVersion("0.1.0", "major")).toBe("1.0.0");
  });

  it("handles double-digit segments", () => {
    expect(bumpVersion("1.9.9", "patch")).toBe("1.9.10");
    expect(bumpVersion("1.9.9", "minor")).toBe("1.10.0");
  });

  it("resets lower segments on minor bump", () => {
    expect(bumpVersion("3.5.7", "minor")).toBe("3.6.0");
  });

  it("resets lower segments on major bump", () => {
    expect(bumpVersion("3.5.7", "major")).toBe("4.0.0");
  });
});
