/** Draft a Slack update linking a transcript to the GitHub issue it most likely concerns. No model call — keyword overlap only. */
import { pickBestIssue, type GithubIssueLite } from "./match";

const REPO = "F1NH4WK/counterpoint";
const SNIPPET_LIMIT = 220;

export async function POST(request: Request) {
  let body: { transcript?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, 4000) : "";
  if (!transcript) return Response.json({ error: "A transcript is required." }, { status: 400 });

  let issues: GithubIssueLite[];
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=50`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return Response.json({ error: `GitHub returned HTTP ${response.status}.` }, { status: 502 });
    }
    const data: unknown = await response.json();
    issues = Array.isArray(data)
      ? data
        .filter((item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && typeof (item as Record<string, unknown>).number === "number" && !("pull_request" in item))
        .map((item) => ({
          number: item.number as number,
          title: typeof item.title === "string" ? item.title : "",
          url: typeof item.html_url === "string" ? item.html_url : "",
          body: typeof item.body === "string" ? item.body : "",
        }))
      : [];
  } catch {
    return Response.json({ error: "GitHub is temporarily unavailable." }, { status: 502 });
  }

  if (!issues.length) {
    return Response.json({ error: "No open issues found on GitHub to match against." }, { status: 502 });
  }

  const best = pickBestIssue(transcript, issues);
  if (!best) {
    return Response.json({ error: "Could not match the transcript to an issue." }, { status: 502 });
  }

  const snippet = transcript.replace(/\s+/g, " ").slice(0, SNIPPET_LIMIT);
  const truncated = transcript.length > SNIPPET_LIMIT ? "…" : "";
  const draft = `Heads up — from today's conversation: "${snippet}${truncated}" This looks related to issue #${best.issue.number} ("${best.issue.title}"). Worth checking ${best.issue.url} to see if it already covers this.`;

  return Response.json({
    issue: { number: best.issue.number, title: best.issue.title, url: best.issue.url },
    draft,
  });
}
