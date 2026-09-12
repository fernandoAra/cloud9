import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route";

const issue = {
  number: 12,
  title: "Voice input drops the first word",
  html_url: "https://github.com/F1NH4WK/counterpoint/issues/12",
  body: "The browser microphone truncates the first spoken word.",
};
const transcript = "The microphone drops the first word when we start recording.";

async function requestDraft(
  key: string | undefined,
  modelResponse?: Response,
): Promise<{ result: { draft: string; source: string }; calls: string[] }> {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    if (key === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = key;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("api.github.com")) return Response.json([issue]);
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(init?.method, "POST");
      assert.equal(JSON.parse(String(init?.body)).model, "google/gemini-2.5-flash-lite");
      assert.ok(init?.signal);
      return modelResponse ?? new Response(null, { status: 503 });
    };
    const response = await POST(new Request("http://localhost/api/counterpoint/draft", {
      method: "POST",
      body: JSON.stringify({ transcript }),
    }));
    assert.equal(response.status, 200);
    return { result: await response.json(), calls };
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
}

test("missing OpenRouter key keeps the original template and skips the model", async () => {
  const { result, calls } = await requestDraft(undefined);
  assert.equal(result.source, "template");
  assert.match(result.draft, /Heads up — from today's conversation/);
  assert.equal(calls.length, 1);
});

test("a successful model response is used for the draft", async () => {
  const { result, calls } = await requestDraft("test-key", Response.json({
    choices: [{ message: { content: "We discussed the first-word recording problem. It appears related to issue #12; please reproduce it with the current microphone setup." } }],
  }));
  assert.equal(result.source, "model");
  assert.match(result.draft, /issue #12/);
  assert.equal(calls.length, 2);
});

test("a failed model request falls back without failing the endpoint", async () => {
  const { result, calls } = await requestDraft("test-key");
  assert.equal(result.source, "template");
  assert.match(result.draft, /Heads up — from today's conversation/);
  assert.equal(calls.length, 2);
});
