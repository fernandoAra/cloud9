import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/counterpoint/route";

test("Gemini answers a detected question even when Exa has no sources", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  try {
    process.env.GEMINI_API_KEY = "test-key";
    globalThis.fetch = async (_input, init) => {
      const prompt = JSON.parse(String(init?.body));
      assert.match(prompt.systemInstruction.parts[0].text, /unverified/);
      assert.match(prompt.contents[0].parts[0].text, /browser speech recognition/);
      return Response.json({ candidates: [{ content: { parts: [{ text: "This is unverified, but browsers can provide speech recognition." }] } }] });
    };
    const response = await POST(new Request("http://localhost/api/counterpoint", {
      method: "POST",
      body: JSON.stringify({ question: "Does browser speech recognition exist?", sources: [] }),
    }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.sourced, false);
    assert.match(result.text, /unverified/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
