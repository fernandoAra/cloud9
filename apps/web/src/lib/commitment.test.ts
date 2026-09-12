import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMITMENT_DEDUPE_WINDOW_MS, detectCommitment } from "./commitment";

test("detects a pt-BR commitment and strips the person's article", () => {
  assert.deepEqual(detectCommitment("nós deveríamos falar com a Ana sobre o rate limit", 123), {
    person: "Ana", topic: "o rate limit", utterance: "nós deveríamos falar com a Ana sobre o rate limit", timestamp: 123, confidence: 0.92,
  });
  assert.equal(detectCommitment("alguém tem que falar com o João sobre autenticação", 123)?.person, "João");
  assert.equal(detectCommitment("precisamos avisar o time sobre a mudança", 123)?.person, "time");
  assert.equal(detectCommitment("vamos combinar com a Ana sobre o lançamento", 123)?.topic, "o lançamento");
});

test("detects an English commitment", () => {
  const result = detectCommitment("we should talk to Ana about rate limiting", 456);
  assert.equal(result?.person, "Ana");
  assert.equal(result?.topic, "rate limiting");
  assert.equal(detectCommitment("someone needs to tell the team about the release", 456)?.person, "team");
});

test("ignores past-tense statements and actions without a person", () => {
  assert.equal(detectCommitment("já falei com a Ana sobre o rate limit", 1), null);
  assert.equal(detectCommitment("precisamos falar sobre o rate limit", 1), null);
});

test("the dedupe default is 60 seconds", () => {
  assert.equal(COMMITMENT_DEDUPE_WINDOW_MS, 60_000);
});
