import assert from "node:assert/strict";
import { test } from "node:test";
import { pickBestIssue, scoreIssue, type GithubIssueLite } from "./match";

const ISSUES: GithubIssueLite[] = [
  { number: 12, title: "Voice input drops the first word", url: "https://example.com/12", body: "The browser microphone truncates the first spoken word during recording." },
  { number: 8, title: "Add dark mode to the dashboard", url: "https://example.com/8", body: "Users want a dark theme toggle in settings." },
  { number: 3, title: "Slack webhook retries on 500", url: "https://example.com/3", body: "" },
];

test("scoreIssue weights title matches higher than body matches", () => {
  const titleMatch = scoreIssue("the dashboard needs a dark mode", ISSUES[1]);
  const bodyOnlyMatch = scoreIssue("truncates recording somehow", ISSUES[0]);
  assert.ok(titleMatch > 0);
  assert.ok(bodyOnlyMatch > 0);
  assert.ok(titleMatch > bodyOnlyMatch);
});

test("scoreIssue returns 0 for an empty or stopword-only transcript", () => {
  assert.equal(scoreIssue("", ISSUES[0]), 0);
  assert.equal(scoreIssue("the and but with", ISSUES[0]), 0);
});

test("pickBestIssue picks the issue with the highest keyword overlap", () => {
  const best = pickBestIssue("our microphone keeps dropping the first spoken word when recording", ISSUES);
  assert.equal(best?.issue.number, 12);
  assert.ok(best && best.score > 0);
});

test("pickBestIssue falls back to the first issue when nothing overlaps", () => {
  const best = pickBestIssue("completely unrelated topic about lunch plans", ISSUES);
  assert.equal(best?.issue.number, ISSUES[0].number);
  assert.equal(best?.score, 0);
});

test("pickBestIssue returns null for an empty issue list", () => {
  assert.equal(pickBestIssue("anything", []), null);
});
