/** A separate, deterministic trigger for person-directed follow-up drafts. */
export type DetectedCommitment = {
  person: string;
  topic: string;
  utterance: string;
  timestamp: number;
  confidence: number;
};

/** Default: do not redraft the same person and topic for 60 seconds. */
export const COMMITMENT_DEDUPE_WINDOW_MS = 60_000;

const WORD = "[\\p{L}][\\p{L}'-]*";
const PERSON = `(?<person>${WORD}(?:\\s+${WORD})?)`;
const TOPIC = "(?<topic>[^?.!\\n]{2,120})";
const PATTERNS: ReadonlyArray<{ pattern: RegExp; confidence: number }> = [
  {
    pattern: new RegExp(`\\b(?:n[oó]s\\s+dever[ií]amos|precisamos|algu[eé]m\\s+tem\\s+que|vamos)\\s+(?:falar|conversar|avisar|combinar)\\s+(?:(?:com|para)\\s+)?(?:(?:a|o|ao|à)\\s+)?${PERSON}\\s+sobre\\s+${TOPIC}`, "giu"),
    confidence: 0.92,
  },
  {
    pattern: new RegExp(`\\b(?:we\\s+should|someone\\s+needs\\s+to)\\s+(?:talk|speak|tell|notify|coordinate)\\s+(?:(?:to|with)\\s+)?(?:the\\s+)?${PERSON}\\s+about\\s+${TOPIC}`, "giu"),
    confidence: 0.91,
  },
];

/** Finds the latest explicit future action with a named recipient and topic. */
export function detectCommitment(transcript: string, timestamp: number): DetectedCommitment | null {
  if (!transcript.trim() || !Number.isFinite(timestamp)) return null;

  let latest: { index: number; value: DetectedCommitment } | null = null;
  for (const { pattern, confidence } of PATTERNS) {
    for (const match of transcript.matchAll(pattern)) {
      const person = match.groups?.person?.trim().replace(/^(?:a|o|ao|à)\s+/iu, "");
      const topic = match.groups?.topic?.replace(/\s+/g, " ").replace(/[.,;:!?\s]+$/u, "").trim();
      if (!person || !topic) continue;
      const value = { person, topic, utterance: match[0].trim(), timestamp, confidence };
      if (!latest || match.index > latest.index) latest = { index: match.index, value };
    }
  }
  return latest?.value ?? null;
}
