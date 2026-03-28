import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "../../skill-discovery";

describe("parseGitHubUrl", () => {
  it("parses standard HTTPS URL", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/claude-code");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-code" });
  });

  it("parses URL with trailing .git", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo.git");
    expect(result).toEqual({ owner: "owner", repo: "repo.git" });
  });

  it("parses URL with additional path segments", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/tree/main/src");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull();
    expect(parseGitHubUrl("")).toBeNull();
  });

  it("handles github.com with no path", () => {
    expect(parseGitHubUrl("https://github.com/")).toBeNull();
  });
});
