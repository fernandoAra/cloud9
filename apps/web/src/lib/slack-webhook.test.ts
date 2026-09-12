import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../app/api/counterpoint/slack/route";

test("Slack configuration status exposes no webhook secret", async () => {
  const previousUrl = process.env.SLACK_WEBHOOK_URL;
  try {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/example";
    assert.deepEqual(await (await GET()).json(), { configured: true });
    delete process.env.SLACK_WEBHOOK_URL;
    assert.deepEqual(await (await GET()).json(), { configured: false });
  } finally {
    if (previousUrl === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = previousUrl;
  }
});

test("Slack webhook receives plain-text fallback and linked issue blocks", async () => {
  const previousUrl = process.env.SLACK_WEBHOOK_URL;
  const previousFetch = globalThis.fetch;
  let sent: Record<string, unknown> | undefined;
  try {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/example";
    globalThis.fetch = async (_input, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response("ok");
    };
    const response = await POST(new Request("http://localhost/api/counterpoint/slack", {
      method: "POST",
      body: JSON.stringify({
        text: "We discussed the microphone issue.",
        issue: { number: 12, title: "Voice input", url: "https://github.com/F1NH4WK/counterpoint/issues/12" },
      }),
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sent, true);
    assert.equal(sent?.text, "We discussed the microphone issue.");
    assert.deepEqual((sent?.blocks as Array<{ type: string }>).map((block) => block.type), ["section", "context"]);
    assert.match(JSON.stringify(sent?.blocks), /github\.com\/F1NH4WK\/counterpoint\/issues\/12/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = previousUrl;
  }
});

test("an unconfigured Slack webhook still returns sent false", async () => {
  const previousUrl = process.env.SLACK_WEBHOOK_URL;
  const previousFetch = globalThis.fetch;
  try {
    delete process.env.SLACK_WEBHOOK_URL;
    globalThis.fetch = async () => { throw new Error("No webhook should be called."); };
    const response = await POST(new Request("http://localhost/api/counterpoint/slack", {
      method: "POST",
      body: JSON.stringify({ text: "Draft", issue: { number: 12, title: "Voice input", url: "https://github.com/F1NH4WK/counterpoint/issues/12" } }),
    }));
    assert.deepEqual(await response.json(), { sent: false, reason: "SLACK_WEBHOOK_URL not configured" });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = previousUrl;
  }
});
