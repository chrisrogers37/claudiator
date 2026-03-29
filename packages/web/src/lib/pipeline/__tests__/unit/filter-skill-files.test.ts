import { describe, it, expect } from "vitest";
import { filterSkillFiles, type TreeEntry } from "../../skill-discovery";

function entry(path: string, type = "blob"): TreeEntry {
  return { path, sha: "abc123", type };
}

describe("filterSkillFiles", () => {
  it("finds SKILL.md at repo root", () => {
    const result = filterSkillFiles([entry("SKILL.md")]);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("SKILL.md");
  });

  it("finds nested SKILL.md files", () => {
    const result = filterSkillFiles([
      entry("skills/deploy/SKILL.md"),
      entry("tools/lint/SKILL.md"),
    ]);
    expect(result).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    const result = filterSkillFiles([
      entry("skill.md"),
      entry("Skill.md"),
      entry("path/SKILL.MD"),
    ]);
    expect(result).toHaveLength(3);
  });

  it("excludes node_modules paths", () => {
    const result = filterSkillFiles([
      entry("node_modules/pkg/SKILL.md"),
      entry("src/SKILL.md"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/SKILL.md");
  });

  it("excludes .git paths", () => {
    const result = filterSkillFiles([entry(".git/hooks/SKILL.md")]);
    expect(result).toHaveLength(0);
  });

  it("excludes dist paths", () => {
    const result = filterSkillFiles([entry("dist/SKILL.md")]);
    expect(result).toHaveLength(0);
  });

  it("excludes build paths", () => {
    const result = filterSkillFiles([entry("build/output/SKILL.md")]);
    expect(result).toHaveLength(0);
  });

  it("ignores tree entries that are not blobs", () => {
    const result = filterSkillFiles([entry("skills/SKILL.md", "tree")]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty tree", () => {
    expect(filterSkillFiles([])).toEqual([]);
  });
});
