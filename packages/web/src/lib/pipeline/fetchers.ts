export async function fetchSource(
  url: string,
  sourceType: string,
  fetchConfig: Record<string, string>
): Promise<string> {
  switch (sourceType) {
    case "anthropic_docs":
    case "anthropic_blog":
    case "changelog":
      return fetchWebPage(url);
    case "github_repo":
    case "mcp_registry":
      return fetchGitHubRepo(url, fetchConfig);
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
}

async function fetchWebPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "claudiator-intelligence-pipeline/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const html = await response.text();
  return extractTextContent(html);
}

async function fetchGitHubRepo(
  url: string,
  config: Record<string, string>
): Promise<string> {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  const [, owner, repo] = match;
  const watchTypes = (config.watch || "releases").split(",");

  const parts: string[] = [];
  const headers = githubHeaders();

  if (watchTypes.includes("releases")) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );
    if (res.ok) {
      const releases = await res.json();
      parts.push(
        "RELEASES:\n" +
          JSON.stringify(
            releases.map((r: Record<string, unknown>) => ({
              tag: r.tag_name,
              name: r.name,
              body: (r.body as string)?.slice(0, 2000),
              date: r.published_at,
            }))
          )
      );
    }
  }

  if (watchTypes.includes("commits")) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );
    if (res.ok) {
      const commits = await res.json();
      parts.push(
        "RECENT_COMMITS:\n" +
          JSON.stringify(
            commits.map(
              (c: { sha: string; commit: { message: string; author: { date: string } } }) => ({
                sha: c.sha.slice(0, 7),
                message: c.commit.message.slice(0, 200),
                date: c.commit.author.date,
              })
            )
          )
      );
    }
  }

  return parts.join("\n\n");
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "claudiator-intelligence-pipeline/1.0",
    Accept: "application/vnd.github.v3+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function extractTextContent(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, 50_000);
}
