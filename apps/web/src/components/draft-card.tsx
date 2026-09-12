"use client";

import { useEffect, useState } from "react";

type MatchedIssue = { number: number; title: string; url: string };
export type AutomaticDraft = { id: number; person: string; issue: MatchedIssue | null; draft: string };

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent" }
  | { status: "not-configured"; reason: string }
  | { status: "error"; message: string };

export function DraftCard({ transcript, automaticDraft, automaticDraftPending = false, onManualDraftInFlightChange }: {
  transcript: string;
  automaticDraft?: AutomaticDraft | null;
  automaticDraftPending?: boolean;
  onManualDraftInFlightChange?: (inFlight: boolean) => void;
}) {
  const [issue, setIssue] = useState<MatchedIssue | null>(null);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });
  const [recipient, setRecipient] = useState("");
  const [slackConfigured, setSlackConfigured] = useState<boolean | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    void fetch("/api/counterpoint/slack")
      .then((response) => response.json())
      .then((data: { configured?: boolean }) => setSlackConfigured(data.configured === true))
      .catch(() => setSlackConfigured(null));
  }, []);

  useEffect(() => {
    if (!automaticDraft) {
      setIssue(null);
      setDraft("");
      setRecipient("");
      setSendState({ status: "idle" });
      return;
    }
    setIssue(automaticDraft.issue);
    setDraft(automaticDraft.draft);
    setRecipient(automaticDraft.person);
    setDraftError("");
    setSendState({ status: "idle" });
    setCopyStatus("");
  }, [automaticDraft]);

  async function draftMessage() {
    if (drafting || automaticDraftPending) return;
    onManualDraftInFlightChange?.(true);
    setRecipient("");
    setDrafting(true);
    setDraftError("");
    setSendState({ status: "idle" });
    setCopyStatus("");
    try {
      const response = await fetch("/api/counterpoint/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Draft request failed (HTTP ${response.status}).`);
      setIssue(data.issue ?? null);
      setDraft(data.draft);
    } catch (error) {
      setIssue(null);
      setDraft("");
      setDraftError(error instanceof Error ? error.message : "Unable to draft a Slack message.");
    } finally {
      setDrafting(false);
      onManualDraftInFlightChange?.(false);
    }
  }

  async function sendToSlack() {
    setSendState({ status: "sending" });
    try {
      const response = await fetch("/api/counterpoint/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft, issue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Slack request failed (HTTP ${response.status}).`);
      if (data.sent) {
        setSendState({ status: "sent" });
      } else {
        setSendState({ status: "not-configured", reason: data.reason || "SLACK_WEBHOOK_URL not configured" });
      }
    } catch (error) {
      setSendState({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to send to Slack.",
      });
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyStatus(`Draft copied. Open ${recipient ? `${recipient}'s` : "the intended"} DM in Slack, paste it, and send there.`);
    } catch {
      setCopyStatus("Copy failed. Select the draft text above and copy it manually.");
    }
  }

  return (
    <section className="ck-card" aria-labelledby="draft-card-title">
      <h3 id="draft-card-title">Draft a Slack update</h3>
      {slackConfigured === true && <p className="ck-local-note">Slack webhook available; delivery is checked when you send.</p>}
      <button
        type="button"
        className="ck-btn"
        disabled={drafting || automaticDraftPending || !transcript.trim()}
        onClick={draftMessage}
      >
        {drafting || automaticDraftPending ? "Matching to an issue…" : "Draft Slack update"}
      </button>

      {draftError && (
        <p role="alert" className="ck-error">
          {draftError}
        </p>
      )}

      {draft && (
        <>
          {recipient && <p role="status" className="ck-local-note">Draft addressed to {recipient} — awaiting your approval. {slackConfigured === false ? "Copying does not send it." : "Send to Slack posts to the webhook destination, not automatically to this person."}</p>}
          {issue ? (
            <p className="ck-local-note">Matched to{" "}<a href={issue.url} target="_blank" rel="noreferrer">#{issue.number} {issue.title}</a></p>
          ) : <p className="ck-local-note">No matching open GitHub issue. This draft has no issue link.</p>}
          <label className="ck-sr-only" htmlFor="draft-card-textarea">
            Drafted Slack message
          </label>
          <textarea
            id="draft-card-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
          />
          {slackConfigured === false ? (
            <>
              <button type="button" className="ck-btn ck-btn--primary" disabled={!draft.trim()} onClick={() => void copyDraft()}>Copy draft for Slack</button>
              {copyStatus && <p role="status" className="ck-local-note">{copyStatus}</p>}
            </>
          ) : (
            <button
              type="button"
              className="ck-btn ck-btn--primary"
              disabled={sendState.status === "sending" || !draft.trim()}
              onClick={sendToSlack}
            >
              {sendState.status === "sending" ? "Sending…" : "Send to Slack"}
            </button>
          )}

          {sendState.status === "sent" && (
            <p role="status" className="ck-notice">
              Sent to Slack.
            </p>
          )}
          {sendState.status === "not-configured" && (
            <p role="status" className="ck-local-note">
              Not sent — {sendState.reason}.
            </p>
          )}
          {sendState.status === "error" && (
            <p role="alert" className="ck-error">
              {sendState.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
