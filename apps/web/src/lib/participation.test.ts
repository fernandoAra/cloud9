import assert from "node:assert/strict";
import test from "node:test";
import {
  createGateState,
  decideParticipation,
  FINDING_STALE_MS,
  initialParticipationState,
  MIN_SILENCE_MS,
  QUICK_CANDIDATE_EXPIRY_MS,
  QUICK_OPENING_MS,
  reduceParticipation,
  transition,
  type ParticipationEvent,
  type ParticipationState,
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

function applyQuick(state: ParticipationState, ...events: ParticipationEvent[]): ParticipationState {
  return events.reduce((current, event) => transition(current, event).state, state);
}

test("short-form candidates wait through a short pause and enter at an opening", () => {
  const state = applyQuick(createGateState(),
    { type: "speech_started", at: 0 },
    { type: "speech_stopped", at: 1_000 },
    { type: "candidate_ready", at: 1_050, candidateId: "critique-1" },
  );
  const early = transition(state, { type: "tick", at: 1_549 });
  assert.equal(early.state.phase, "holding");
  assert.deepEqual(early.actions, []);
  const opening = transition(early.state, { type: "tick", at: 1_000 + QUICK_OPENING_MS });
  assert.equal(opening.state.phase, "opening");
  assert.deepEqual(opening.actions, [{ type: "allow_candidate", candidateId: "critique-1", at: 1_900, silenceMs: 900 }]);
});

test("a short-form candidate expires if no opening appears", () => {
  const state = applyQuick(createGateState(),
    { type: "speech_started", at: 0 },
    { type: "candidate_ready", at: 100, candidateId: "stale-idea" },
  );
  const expired = transition(state, { type: "tick", at: 100 + QUICK_CANDIDATE_EXPIRY_MS });
  assert.equal(expired.state.phase, "listening");
  assert.equal(expired.state.quickCandidate, null);
  assert.deepEqual(expired.actions, [{ type: "suppress_candidate", candidateId: "stale-idea", at: 2_600, reason: "candidate_expired" }]);
});

test("a human resuming before short-form speech starts suppresses the candidate", () => {
  const state = applyQuick(createGateState(),
    { type: "speech_started", at: 0 },
    { type: "speech_stopped", at: 1_000 },
    { type: "candidate_ready", at: 1_050, candidateId: "missed-gap" },
    { type: "tick", at: 1_900 },
  );
  const resumed = transition(state, { type: "speech_started", at: 1_950 });
  assert.equal(resumed.state.phase, "listening");
  assert.deepEqual(resumed.actions, [{ type: "suppress_candidate", candidateId: "missed-gap", at: 1_950, reason: "human_resumed_before_agent_started" }]);
});

test("human speech cancels active agent audio", () => {
  const state = applyQuick(createGateState(),
    { type: "speech_started", at: 0 },
    { type: "speech_stopped", at: 1_000 },
    { type: "candidate_ready", at: 1_050, candidateId: "spoken-idea" },
    { type: "tick", at: 1_900 },
    { type: "agent_audio_started", at: 1_920, candidateId: "spoken-idea" },
  );
  const interrupted = transition(state, { type: "speech_started", at: 2_000 });
  assert.equal(interrupted.state.phase, "listening");
  assert.equal(interrupted.state.quickCandidate, null);
  assert.deepEqual(interrupted.actions, [{ type: "cancel_agent_audio", candidateId: "spoken-idea", at: 2_000 }]);
});

test("the gate rejects non-monotonic timestamps", () => {
  const state = applyQuick(createGateState(), { type: "speech_started", at: 100 });
  assert.throws(() => transition(state, { type: "tick", at: 99 }), /moved backwards/);
});
