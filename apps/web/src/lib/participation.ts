/** A quiet opening must last this long before a prepared finding may be offered. */
export const MIN_SILENCE_MS = 1_200;

/** Pauses shorter than this are ordinary gaps inside human speech. */
export const SHORT_PAUSE_MS = 550;

/** A short-form candidate may enter after this much silence. */
export const QUICK_OPENING_MS = 900;

/** A short-form candidate expires this long after it becomes ready. */
export const QUICK_CANDIDATE_EXPIRY_MS = 2_500;

/** A finding loses its turn if its original question is older than this. */
export const FINDING_STALE_MS = 45_000;

export type ParticipationEvent =
  | { type: "speech_started" | "speech_stopped" | "topic_changed"; at: number }
  | { type: "question_detected" | "finding_ready"; at: number; questionId: string }
  | { type: "candidate_ready" | "agent_audio_started" | "agent_audio_ended"; at: number; candidateId: string }
  | { type: "tick"; at: number };

export type GatePhase = "idle" | "listening" | "holding" | "opening" | "speaking";
export type GateAction =
  | { type: "allow_candidate"; candidateId: string; at: number; silenceMs: number }
  | { type: "suppress_candidate"; candidateId: string; at: number; reason: "candidate_expired" | "human_resumed_before_agent_started" }
  | { type: "cancel_agent_audio"; candidateId: string; at: number };

export type ParticipationDecision = {
  action: "OFFER" | "HOLD" | "DISCARD";
  reason: string;
};

export type ParticipationState = {
  phase: GatePhase;
  humanSpeaking: boolean;
  lastSpeechStoppedAt: number | null;
  topicChangedAt: number | null;
  questions: Record<string, number>;
  findings: Record<string, number>;
  quickCandidate: { id: string; readyAt: number; allowedAt?: number } | null;
  agentSpeakingId: string | null;
  lastEventAt: number;
};

export const initialParticipationState: ParticipationState = {
  phase: "idle",
  humanSpeaking: false,
  lastSpeechStoppedAt: null,
  topicChangedAt: null,
  questions: {},
  findings: {},
  quickCandidate: null,
  agentSpeakingId: null,
  lastEventAt: 0,
};

export function createGateState(at = 0): ParticipationState {
  return { ...initialParticipationState, questions: {}, findings: {}, lastEventAt: at };
}

/** Keep speech, question, and topic signals independent of the audio transport. */
export function reduceParticipation(
  state: ParticipationState,
  event: ParticipationEvent,
): ParticipationState {
  switch (event.type) {
    case "speech_started":
      return { ...state, humanSpeaking: true, phase: "listening", lastEventAt: event.at };
    case "speech_stopped":
      return { ...state, humanSpeaking: false, lastSpeechStoppedAt: event.at, phase: state.quickCandidate ? "holding" : "idle", lastEventAt: event.at };
    case "topic_changed":
      return { ...state, topicChangedAt: event.at, lastEventAt: event.at };
    case "question_detected":
      return {
        ...state,
        // Incremental transcripts may detect the same question repeatedly.
        // Keep its first timestamp so repetition cannot extend its lifetime.
        questions: {
          ...state.questions,
          [event.questionId]: state.questions[event.questionId] ?? event.at,
        },
        lastEventAt: event.at,
      };
    case "finding_ready":
      return {
        ...state,
        findings: { ...state.findings, [event.questionId]: event.at },
        lastEventAt: event.at,
      };
    case "candidate_ready":
      if (state.quickCandidate) throw new Error("A short-form candidate is already pending.");
      return { ...state, quickCandidate: { id: event.candidateId, readyAt: event.at }, phase: "holding", lastEventAt: event.at };
    case "agent_audio_started":
      return { ...state, agentSpeakingId: event.candidateId, phase: "speaking", lastEventAt: event.at };
    case "agent_audio_ended":
      return { ...state, agentSpeakingId: null, quickCandidate: state.quickCandidate?.id === event.candidateId ? null : state.quickCandidate, phase: state.humanSpeaking ? "listening" : "idle", lastEventAt: event.at };
    case "tick":
      return { ...state, lastEventAt: event.at };
  }
}

function hasOpening(state: ParticipationState, now: number, threshold: number, inclusive = false): boolean {
  if (state.humanSpeaking || state.lastSpeechStoppedAt === null) return false;
  const silenceMs = now - state.lastSpeechStoppedAt;
  return inclusive ? silenceMs >= threshold : silenceMs > threshold;
}

/** Apply timestamped room events and return any audio action for the application. */
export function transition(state: ParticipationState, event: ParticipationEvent): { state: ParticipationState; actions: GateAction[] } {
  if (event.at < state.lastEventAt) throw new RangeError(`Turn-taking event time moved backwards: ${event.at} < ${state.lastEventAt}.`);
  const actions: GateAction[] = [];
  const previous = state;
  let next = reduceParticipation(state, event);

  if (event.type === "speech_started") {
    if (previous.agentSpeakingId) {
      actions.push({ type: "cancel_agent_audio", candidateId: previous.agentSpeakingId, at: event.at });
      next = { ...next, agentSpeakingId: null, quickCandidate: null };
    } else if (previous.quickCandidate?.allowedAt !== undefined) {
      actions.push({ type: "suppress_candidate", candidateId: previous.quickCandidate.id, at: event.at, reason: "human_resumed_before_agent_started" });
      next = { ...next, quickCandidate: null };
    }
  }

  if (event.type === "tick" && next.quickCandidate && next.quickCandidate.allowedAt === undefined) {
    const candidate = next.quickCandidate;
    if (event.at - candidate.readyAt >= QUICK_CANDIDATE_EXPIRY_MS) {
      actions.push({ type: "suppress_candidate", candidateId: candidate.id, at: event.at, reason: "candidate_expired" });
      next = { ...next, quickCandidate: null, phase: next.humanSpeaking ? "listening" : "idle" };
    } else if (hasOpening(next, event.at, QUICK_OPENING_MS, true)) {
      const silenceMs = event.at - next.lastSpeechStoppedAt!;
      actions.push({ type: "allow_candidate", candidateId: candidate.id, at: event.at, silenceMs });
      next = { ...next, phase: "opening", quickCandidate: { ...candidate, allowedAt: event.at } };
    }
  }
  return { state: next, actions };
}

/** Evaluate one queued finding. Call again as time passes to detect a quiet opening. */
export function decideParticipation(
  state: ParticipationState,
  now: number,
  questionId: string,
): ParticipationDecision {
  const questionAt = state.questions[questionId];
  if (questionAt === undefined) {
    return { action: "HOLD", reason: "Waiting for a detected question." };
  }

  if (state.topicChangedAt !== null && state.topicChangedAt > questionAt) {
    return { action: "DISCARD", reason: "The conversation moved to a new topic." };
  }

  if (now - questionAt > FINDING_STALE_MS) {
    return { action: "DISCARD", reason: "The original question is now too old." };
  }

  if (state.findings[questionId] === undefined) {
    return { action: "HOLD", reason: "Research is still in progress." };
  }

  if (state.humanSpeaking) {
    return { action: "HOLD", reason: "A person has the floor." };
  }

  if (state.agentSpeakingId) {
    return { action: "HOLD", reason: "Counterpoint is already speaking." };
  }

  if (!hasOpening(state, now, MIN_SILENCE_MS)) {
    return { action: "HOLD", reason: "Waiting for a longer quiet opening." };
  }

  return { action: "OFFER", reason: "The finding is fresh and the room is quiet." };
}
