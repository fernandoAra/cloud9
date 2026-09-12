import assert from "node:assert/strict";
import test from "node:test";
import { detectUncertainty } from "./uncertainty";

test("detects concrete researchable uncertainties before a transcript is finalized", () => {
  const existing = detectUncertainty("Maybe a browser agent could help. Does this already exist", 100);
  assert.deepEqual(existing, {
    question: "Does this already exist?",
    timestamp: 100,
    confidence: 0.94,
  });

  const comparison = detectUncertainty("Is model A actually faster than model B?", 120);
  assert.equal(comparison?.question, "Is model A actually faster than model B?");
  assert.ok((comparison?.confidence ?? 0) > 0.8);

  const priorArt = detectUncertainty("Who else has built this?", 130);
  assert.equal(priorArt?.question, "Who else has built this?");

  const portuguese = detectUncertainty("Será que esse produto já existe?", 140);
  assert.equal(portuguese?.question, "Será que esse produto já existe?");

  const factual = detectUncertainty("Qual a velocidade de uma andorinha grávida?", 150);
  assert.equal(factual?.question, "Qual a velocidade de uma andorinha grávida?");
});

test("ignores rhetorical questions that do not call for research", () => {
  assert.equal(detectUncertainty("Who cares? Isn't that obvious? Why bother?", 200), null);
});

test("ignores statements and empty input", () => {
  assert.equal(detectUncertainty("We should build a simple prototype today.", 300), null);
  assert.equal(detectUncertainty("  ", 300), null);
});
