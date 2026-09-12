/** A quiet opening must last this long before a prepared finding may be offered. */
export const MIN_SILENCE_MS = 1_200;

/** A finding loses its turn if its original question is older than this. */
export const FINDING_STALE_MS = 45_000;

export type ParticipationEvent =
  | { type: "speech_started" | "speech_stopped" | "topic_changed"; at: number }
  | { type: "question_detected" | "finding_ready"; at: number; questionId: string };

export type ParticipationDecision = {
  action: "OFFER" | "HOLD" | "DISCARD";
  reason: string;
};

export type ParticipationState = {
  humanSpeaking: boolean;
  lastSpeechStoppedAt: number | null;
  topicChangedAt: number | null;
  questions: Record<string, number>;
  findings: Record<string, number>;
};

export const initialParticipationState: ParticipationState = {
  humanSpeaking: false,
  lastSpeechStoppedAt: null,
  topicChangedAt: null,
  questions: {},
  findings: {},
};

/** Keep speech, question, and topic signals independent of the audio transport. */
export function reduceParticipation(
  state: ParticipationState,
  event: ParticipationEvent,
): ParticipationState {
  switch (event.type) {
    case "speech_started":
      return { ...state, humanSpeaking: true };
    case "speech_stopped":
      return { ...state, humanSpeaking: false, lastSpeechStoppedAt: event.at };
    case "topic_changed":
      return { ...state, topicChangedAt: event.at };
    case "question_detected":
      return {
        ...state,
        // Incremental transcripts may detect the same question repeatedly.
        // Keep its first timestamp so repetition cannot extend its lifetime.
        questions: {
          ...state.questions,
          [event.questionId]: state.questions[event.questionId] ?? event.at,
        },
      };
    case "finding_ready":
      return {
        ...state,
        findings: { ...state.findings, [event.questionId]: event.at },
      };
  }
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

  if (
    state.lastSpeechStoppedAt === null ||
    now - state.lastSpeechStoppedAt <= MIN_SILENCE_MS
  ) {
    return { action: "HOLD", reason: "Waiting for a longer quiet opening." };
  }

  return { action: "OFFER", reason: "The finding is fresh and the room is quiet." };
}
