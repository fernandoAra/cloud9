/** Post a drafted message to Slack via an incoming webhook, if one is configured. */
export async function GET() {
  return Response.json({ configured: Boolean(process.env.SLACK_WEBHOOK_URL?.trim()) });
}

export async function POST(request: Request) {
  let body: { text?: unknown; issue?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!text) return Response.json({ error: "Text is required." }, { status: 400 });
  const issue = body.issue && typeof body.issue === "object"
    ? body.issue as Record<string, unknown>
    : null;
  const issueNumber = issue?.number;
  const issueTitle = issue?.title;
  const issueUrl = issue?.url;
  let issueContext: string | null = null;
  if (Number.isSafeInteger(issueNumber) && Number(issueNumber) > 0
    && typeof issueTitle === "string" && typeof issueUrl === "string") {
    try {
      const url = new URL(issueUrl);
      if (url.protocol === "https:" && url.hostname === "github.com"
        && url.pathname.endsWith(`/issues/${issueNumber}`) && !/[<>|]/.test(url.pathname)) {
        const label = issueTitle.trim().replace(/[&<>|]/g, " ").slice(0, 120);
        issueContext = `Issue: <${url.origin}${url.pathname}|#${issueNumber} ${label}>`;
      }
    } catch {
      // Invalid optional issue metadata does not prevent sending the draft.
    }
  }
  const blocks = [
    { type: "section", text: { type: "plain_text", text: text.slice(0, 3000) } },
    ...(issueContext
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: issueContext }] }]
      : []),
  ];

  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return Response.json({ sent: false, reason: "SLACK_WEBHOOK_URL not configured" });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return Response.json({ error: `Slack returned HTTP ${response.status}.` }, { status: 502 });
    }
  } catch {
    return Response.json({ error: "Slack is temporarily unavailable." }, { status: 502 });
  }

  return Response.json({ sent: true });
}
