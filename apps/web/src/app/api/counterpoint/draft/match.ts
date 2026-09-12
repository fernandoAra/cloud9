/** Pure keyword-overlap matching between a transcript and GitHub issues. No model call. */
export type GithubIssueLite = { number: number; title: string; url: string; body?: string };

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "with", "this", "that",
  "have", "from", "was", "were", "will", "would", "could", "should", "can",
  "just", "about", "into", "over", "than", "then", "them", "they", "what",
  "when", "where", "which", "who", "why", "how", "all", "any", "our", "your",
]);

function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length > 2 && !STOPWORDS.has(word)));
}

export function scoreIssue(transcript: string, issue: GithubIssueLite): number {
  const transcriptWords = tokenize(transcript);
  if (!transcriptWords.size) return 0;
  const titleWords = tokenize(issue.title);
  const bodyWords = tokenize(issue.body ?? "");
  let score = 0;
  for (const word of titleWords) if (transcriptWords.has(word)) score += 2;
  for (const word of bodyWords) if (transcriptWords.has(word)) score += 1;
  return score;
}

export function pickBestIssue(
  transcript: string,
  issues: GithubIssueLite[],
): { issue: GithubIssueLite; score: number } | null {
  if (!issues.length) return null;
  let best = { issue: issues[0], score: scoreIssue(transcript, issues[0]) };
  for (const issue of issues.slice(1)) {
    const score = scoreIssue(transcript, issue);
    if (score > best.score) best = { issue, score };
  }
  return best;
}
