/** A narrow, deterministic trigger for background research during a brainstorm. */
export type DetectedQuestion = {
  question: string;
  timestamp: number;
  confidence: number;
};

const RESEARCH_QUESTIONS: ReadonlyArray<{ pattern: RegExp; confidence: number }> = [
  { pattern: /\bdoes\s+[^?.!\n]{1,100}?\s+(?:already\s+)?exist\b[^?.!\n]*/gi, confidence: 0.94 },
  { pattern: /\b(?:is|are)\s+[^?.!\n]{1,80}?\s+(?:actually\s+)?(?:faster|slower|cheaper|better)\s+than\s+[^?.!\n]{1,80}/gi, confidence: 0.88 },
  { pattern: /\bwho\s+else\s+(?:has|have)\s+(?:built|made|created|done)\b[^?.!\n]*/gi, confidence: 0.91 },
  { pattern: /\bhas\s+anyone\s+(?:already\s+)?(?:built|made|created|done)\b[^?.!\n]*/gi, confidence: 0.88 },
  { pattern: /\bser[aá]\s+que\s+[^?.!\n]{1,100}?\s+(?:j[aá]\s+)?existe\b[^?.!\n]*/gi, confidence: 0.92 },
  { pattern: /\b(?:isso|essa?\s+ideia)\s+j[aá]\s+existe\b[^?.!\n]*/gi, confidence: 0.9 },
  { pattern: /\balgu[eé]m\s+j[aá]\s+(?:fez|criou|construiu)\b[^?.!\n]*/gi, confidence: 0.88 },
  { pattern: /\bquem\s+mais\s+(?:fez|criou|construiu)\b[^?.!\n]*/gi, confidence: 0.88 },
];

/**
 * Finds the latest explicit, researchable uncertainty in a transcript fragment.
 * The timestamp is supplied by the caller so the result can later expire.
 * This deliberately ignores generic and rhetorical questions such as "who cares?".
 */
export function detectUncertainty(transcript: string, timestamp: number): DetectedQuestion | null {
  if (!transcript.trim() || !Number.isFinite(timestamp)) return null;

  let latest: { index: number; question: string; confidence: number } | null = null;
  for (const { pattern, confidence } of RESEARCH_QUESTIONS) {
    for (const match of transcript.matchAll(pattern)) {
      const question = match[0].replace(/\s+/g, " ").trim();
      if (question.length > 160) continue;
      if (!latest || match.index > latest.index) {
        latest = { index: match.index, question, confidence };
      }
    }
  }

  return latest
    ? { question: `${latest.question.replace(/[?.!]+$/, "")}?`, timestamp, confidence: latest.confidence }
    : null;
}
