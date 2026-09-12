/** Draft a Slack update linking a transcript to the GitHub issue it most likely concerns. */
import { pickBestIssue, type GithubIssueLite } from "./match";

const REPO = "F1NH4WK/counterpoint";
const SNIPPET_LIMIT = 220;
const DRAFT_MODEL = "google/gemini-2.5-flash-lite";

async function writeModelDraft(transcript: string, issue: GithubIssueLite | null, person: string): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DRAFT_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: "Write a 2-3 sentence plain-text Slack message to a teammate. Address the named person directly when one is supplied. Say what was said in the meeting about the named topic and one concrete next step. If a GitHub issue is supplied, explain the connection and cite its number; otherwise do not claim an issue exists. No markdown headers or emoji. Never invent facts beyond the topic or supplied issue. If the connection is uncertain, say so.",
          },
          {
            role: "user",
            content: `Recipient: ${person || "unspecified teammate"}\nMeeting topic: ${transcript}\n\n${issue ? `GitHub issue #${issue.number}: ${issue.title}\nIssue description: ${issue.body?.slice(0, 2000) ?? ""}\nIssue URL: ${issue.url}` : "No matching GitHub issue is available."}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim().slice(0, 1200) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { transcript?: unknown; person?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, 4000) : "";
  const person = typeof body.person === "string" ? body.person.trim().slice(0, 80) : "";
  if (!transcript) return Response.json({ error: "A transcript is required." }, { status: 400 });

  let issues: GithubIssueLite[] = [];
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=50`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
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
    // A draft is still useful when GitHub is unavailable or has no open issues.
  }

  const match = pickBestIssue(transcript, issues);
  const issue = match && match.score > 0 ? match.issue : null;

  const snippet = transcript.replace(/\s+/g, " ").slice(0, SNIPPET_LIMIT);
  const truncated = transcript.length > SNIPPET_LIMIT ? "…" : "";
  const templateDraft = `${person ? `Hi ${person} — ` : ""}Heads up — from today's conversation: "${snippet}${truncated}" ${issue
    ? `This looks related to issue #${issue.number} ("${issue.title}"). Worth checking ${issue.url} to see if it already covers this.`
    : "There is no matching open GitHub issue; could you review this topic and suggest the next step?"}`;
  const modelDraft = await writeModelDraft(transcript, issue, person);
  const draft = modelDraft ?? templateDraft;

  return Response.json({
    issue: issue ? { number: issue.number, title: issue.title, url: issue.url } : null,
    draft,
    source: modelDraft ? "model" : "template",
  });
}
