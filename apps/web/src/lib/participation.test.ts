import assert from "node:assert/strict";
import test from "node:test";
import {
  decideParticipation,
  FINDING_STALE_MS,
  initialParticipationState,
  MIN_SILENCE_MS,
  reduceParticipation,
  type ParticipationEvent,
} from "./participation";

function after(...events: ParticipationEvent[]) {
  return events.reduce(reduceParticipation, initialParticipationState);
}

test("holds while a person speaks, then offers only after a long enough pause", () => {
  const speaking = after(
    { type: "question_detected", questionId: "q1", at: 1_000 },
    { type: "finding_ready", questionId: "q1", at: 1_500 },
    { type: "speech_started", at: 2_000 },
  );
  assert.deepEqual(decideParticipation(speaking, 20_000, "q1"), {
    action: "HOLD",
    reason: "A person has the floor.",
  });

  const quiet = reduceParticipation(speaking, { type: "speech_stopped", at: 20_000 });
  assert.equal(decideParticipation(quiet, 20_000 + MIN_SILENCE_MS, "q1").action, "HOLD");
  assert.equal(decideParticipation(quiet, 20_001 + MIN_SILENCE_MS, "q1").action, "OFFER");
});

test("discards a stale finding even if the room is quiet", () => {
  const state = after(
    { type: "question_detected", questionId: "q1", at: 1_000 },
    { type: "finding_ready", questionId: "q1", at: 2_000 },
    { type: "speech_stopped", at: 3_000 },
  );
  assert.deepEqual(decideParticipation(state, 1_001 + FINDING_STALE_MS, "q1"), {
    action: "DISCARD",
    reason: "The original question is now too old.",
  });
});

test("discards old-topic findings but keeps questions from the new topic", () => {
  const state = after(
    { type: "question_detected", questionId: "old", at: 1_000 },
    { type: "finding_ready", questionId: "old", at: 2_000 },
    { type: "topic_changed", at: 3_000 },
    { type: "question_detected", questionId: "new", at: 4_000 },
    { type: "finding_ready", questionId: "new", at: 5_000 },
    { type: "speech_stopped", at: 6_000 },
  );
  assert.equal(decideParticipation(state, 8_000, "old").action, "DISCARD");
  assert.equal(decideParticipation(state, 8_000, "new").action, "OFFER");
});

test("holds until research is ready", () => {
  const state = after(
    { type: "question_detected", questionId: "q1", at: 1_000 },
    { type: "speech_stopped", at: 2_000 },
  );
  assert.deepEqual(decideParticipation(state, 4_000, "q1"), {
    action: "HOLD",
    reason: "Research is still in progress.",
  });
});

test("repeated detection cannot refresh a question's staleness clock", () => {
  const state = after(
    { type: "question_detected", questionId: "q1", at: 1_000 },
    { type: "question_detected", questionId: "q1", at: 30_000 },
    { type: "finding_ready", questionId: "q1", at: 30_000 },
    { type: "speech_stopped", at: 31_000 },
  );
  assert.equal(decideParticipation(state, 1_001 + FINDING_STALE_MS, "q1").action, "DISCARD");
});
