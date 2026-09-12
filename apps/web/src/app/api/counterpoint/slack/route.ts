/** Post a drafted message to Slack via an incoming webhook, if one is configured. */
export async function POST(request: Request) {
  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!text) return Response.json({ error: "Text is required." }, { status: 400 });

  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return Response.json({ sent: false, reason: "SLACK_WEBHOOK_URL not configured" });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
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
