"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { SURFACE_RULES, searchWebParameters } from "agent-core/shared";
import { REALTIME_MODEL } from "@/lib/realtime-config";
import { detectUncertainty, type DetectedQuestion } from "@/lib/uncertainty";
import {
  decideParticipation,
  initialParticipationState,
  reduceParticipation,
  type ParticipationDecision,
} from "@/lib/participation";

type Status = "idle" | "connecting" | "live" | "error";
type ResearchStatus = "idle" | "searching" | "ready" | "unavailable";
type SearchHit = { title: string; url: string; highlight?: string };
type PreparedFinding = {
  questionId: string;
  question: string;
  summary: string;
  sources: SearchHit[];
  detectedAt: number;
};

const TOPIC_CHANGE = /\b(?:moving on|different topic|change (?:the )?subject|let'?s (?:move on|talk about something else))\b/i;

function sourceHits(value: unknown): SearchHit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item.title !== "string" || typeof item.url !== "string") return [];
    try {
      const url = new URL(item.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") return [];
      return [{ title: item.title, url: url.href, highlight: typeof item.highlight === "string" ? item.highlight : undefined }];
    } catch {
      return [];
    }
  });
}

function shortFinding(hit: SearchHit): string {
  const excerpt = hit.highlight?.replace(/\s+/g, " ").trim().split(/[.!?](?:\s|$)/)[0].slice(0, 220);
  return excerpt
    ? `Potentially relevant source: ${hit.title}. ${excerpt}.`
    : `Potentially relevant source: ${hit.title}.`;
}

const searchTheWeb = tool({
  name: "search_web",
  description: "Search the live web for factual questions. Keep spoken answers to two sentences.",
  parameters: searchWebParameters,
  execute: async ({ query, results }) => {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, results }),
    });
    if (!response.ok) return "Search is unavailable right now. Say so rather than guessing.";
    const data = (await response.json()) as { results?: unknown };
    return JSON.stringify(data.results ?? []);
  },
});

const voiceAgent = new RealtimeAgent({
  name: "Everywhere",
  instructions: [
    SURFACE_RULES,
    "",
    "You are an optional participant in a live brainstorm between humans. Help with concrete, researchable uncertainties while keeping the humans' discussion central.",
    "When relevant, use search_web for factual claims. Distinguish a sourced finding from your own inference. If live search is unavailable, say so plainly.",
    "You are speaking out loud. Answer in one or two sentences. Never read out a URL, id, or code block.",
  ].join("\n"),
  tools: [searchTheWeb],
});

export default function VoicePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const [transcript, setTranscript] = useState<string[]>([]);
  const [question, setQuestion] = useState<DetectedQuestion | null>(null);
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [researchMessage, setResearchMessage] = useState("Waiting for a researchable question.");
  const [findings, setFindings] = useState<PreparedFinding[]>([]);
  const [discarded, setDiscarded] = useState<{ finding: PreparedFinding; reason: string } | null>(null);
  const [decision, setDecision] = useState<ParticipationDecision>({
    action: "HOLD",
    reason: "Waiting for a prepared finding.",
  });
  const [humanSpeaking, setHumanSpeaking] = useState(false);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const participationRef = useRef(initialParticipationState);
  const findingsRef = useRef<PreparedFinding[]>([]);
  const partialTranscriptsRef = useRef<Record<string, string>>({});
  const seenQuestionsRef = useRef(new Set<string>());
  const seenTopicChangesRef = useRef(new Set<string>());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);

  const evaluateDecision = useCallback((now: number) => {
    let current = findingsRef.current;
    for (const finding of current) {
      const next = decideParticipation(participationRef.current, now, finding.questionId);
      if (next.action === "DISCARD") {
        current = current.filter((item) => item.questionId !== finding.questionId);
        setDiscarded({ finding, reason: next.reason });
        if (discardTimerRef.current) clearTimeout(discardTimerRef.current);
        discardTimerRef.current = setTimeout(() => setDiscarded(null), 8_000);
      }
    }
    if (current !== findingsRef.current) {
      findingsRef.current = current;
      setFindings(current);
    }
    const latest = current.at(-1);
    setDecision(latest
      ? decideParticipation(participationRef.current, now, latest.questionId)
      : { action: "HOLD", reason: "Waiting for a prepared finding." });
  }, []);

  const researchQuestion = useCallback(async (detected: DetectedQuestion, questionId: string) => {
    const generation = generationRef.current;
    setQuestion(detected);
    setResearchStatus("searching");
    setResearchMessage("Searching public sources while the conversation continues.");
    participationRef.current = reduceParticipation(participationRef.current, {
      type: "question_detected", at: detected.timestamp, questionId,
    });
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: detected.question, results: 3 }),
      });
      if (!response.ok) throw new Error(`Search returned HTTP ${response.status}.`);
      const payload = (await response.json()) as { results?: unknown };
      if (generation !== generationRef.current) return;
      if (typeof payload.results === "string") throw new Error(payload.results);
      const hits = sourceHits(payload.results);
      if (hits.length === 0) throw new Error("Search returned no usable sources.");
      const finding: PreparedFinding = {
        questionId,
        question: detected.question,
        summary: shortFinding(hits[0]),
        sources: hits,
        detectedAt: detected.timestamp,
      };
      // Completing another search never aborts an in-flight one. Keep at most
      // two prepared findings; an overflow removes only the oldest prepared one.
      const queued = [...findingsRef.current, finding];
      if (queued.length > 2) {
        const oldest = queued.shift()!;
        setDiscarded({ finding: oldest, reason: "The two-finding queue is full; the oldest was dropped." });
        if (discardTimerRef.current) clearTimeout(discardTimerRef.current);
        discardTimerRef.current = setTimeout(() => setDiscarded(null), 8_000);
      }
      findingsRef.current = queued;
      setFindings(queued);
      participationRef.current = reduceParticipation(participationRef.current, {
        type: "finding_ready", at: Date.now(), questionId,
      });
      setResearchStatus("ready");
      setResearchMessage("A sourced finding is prepared. The decision below is advisory.");
      evaluateDecision(Date.now());
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setResearchStatus(findingsRef.current.length > 0 ? "ready" : "unavailable");
      setResearchMessage(cause instanceof Error ? cause.message : "Research failed.");
    }
  }, [evaluateDecision]);

  const detectFromTranscript = useCallback((text: string, itemId: string) => {
    if (seenQuestionsRef.current.has(itemId)) return;
    const detected = detectUncertainty(text, Date.now());
    if (!detected) return;
    seenQuestionsRef.current.add(itemId);
    void researchQuestion(detected, itemId);
  }, [researchQuestion]);

  const connect = useCallback(async () => {
    generationRef.current += 1;
    sessionRef.current?.close();
    sessionRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    if (discardTimerRef.current) clearTimeout(discardTimerRef.current);
    participationRef.current = initialParticipationState;
    findingsRef.current = [];
    partialTranscriptsRef.current = {};
    seenQuestionsRef.current.clear();
    seenTopicChangesRef.current.clear();
    setQuestion(null);
    setFindings([]);
    setDiscarded(null);
    setResearchStatus("idle");
    setResearchMessage("Waiting for a researchable question.");
    setDecision({ action: "HOLD", reason: "Waiting for a prepared finding." });
    setStatus("connecting");
    setError(undefined);
    try {
      const response = await fetch("/api/realtime-token", { method: "POST" });
      const data = (await response.json()) as { value?: string; error?: string };
      if (!response.ok || !data.value) throw new Error(data.error ?? "Could not mint a session token.");

      // Fallback mode: the model's normal VAD response schedule remains active.
      // The panel computes decisions, but cannot yet gate spoken output.
      const session = new RealtimeSession(voiceAgent, {
        transport: "webrtc",
        model: REALTIME_MODEL,
      });

      session.on("transport_event", (event) => {
        const now = Date.now();
        // The installed SDK emits raw input transcript deltas but does not yet
        // merge them into history_updated. Read them here to begin research
        // before the human has finished the turn.
        if (
          event.type === "conversation.item.input_audio_transcription.delta" &&
          typeof event.item_id === "string" &&
          typeof event.delta === "string"
        ) {
          const itemId = event.item_id;
          const text = (partialTranscriptsRef.current[itemId] ?? "") + event.delta;
          partialTranscriptsRef.current[itemId] = text;
          detectFromTranscript(text, itemId);
        }
        if (event.type === "input_audio_buffer.speech_started") {
          setHumanSpeaking(true);
          participationRef.current = reduceParticipation(participationRef.current, { type: "speech_started", at: now });
          evaluateDecision(now);
        } else if (event.type === "input_audio_buffer.speech_stopped") {
          setHumanSpeaking(false);
          participationRef.current = reduceParticipation(participationRef.current, { type: "speech_stopped", at: now });
          evaluateDecision(now);
        }
      });

      session.on("history_updated", (history) => {
        const lines: string[] = [];
        for (const item of history) {
          if (item.type !== "message") continue;
          const text = item.content.map((part) =>
            "transcript" in part ? (part.transcript ?? "") : "text" in part ? part.text : "",
          ).join(" ").trim();
          if (!text) continue;
          lines.push(`${item.role === "user" ? "human" : "agent"}  ${text}`);
          if (item.role !== "user") continue;

          if (TOPIC_CHANGE.test(text) && !seenTopicChangesRef.current.has(item.itemId)) {
            seenTopicChangesRef.current.add(item.itemId);
            const now = Date.now();
            participationRef.current = reduceParticipation(participationRef.current, { type: "topic_changed", at: now });
            evaluateDecision(now);
          }

          detectFromTranscript(text, item.itemId);
        }
        setTranscript(lines);
      });

      session.on("error", (event) => {
        setError(String(event.error ?? event));
        setStatus("error");
      });

      await session.connect({ apiKey: data.value });
      sessionRef.current = session;
      tickRef.current = setInterval(() => evaluateDecision(Date.now()), 250);
      setStatus("live");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, [detectFromTranscript, evaluateDecision]);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    sessionRef.current?.close();
    sessionRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setHumanSpeaking(false);
    setStatus("idle");
  }, []);

  useEffect(() => () => {
    sessionRef.current?.close();
    if (tickRef.current) clearInterval(tickRef.current);
    if (discardTimerRef.current) clearTimeout(discardTimerRef.current);
  }, []);

  return (
    <main className="ck-page">
      <p className="ck-eyebrow">In the room</p>
      <h1>Brainstorm research companion</h1>
      <p className="ck-dek">Ask a concrete research question while discussing an idea. The app prepares a sourced finding in the background.</p>

      <div className="ck-actions" style={{ marginTop: "2rem" }}>
        {status === "live" ? (
          <button type="button" className="ck-btn" onClick={disconnect}>End call</button>
        ) : (
          <button type="button" className="ck-btn ck-btn--primary" onClick={connect} disabled={status === "connecting"}>
            {status === "connecting" ? "Connecting…" : "Start talking"}
          </button>
        )}
        <span className="ck-status" data-status={status}>{status}</span>
      </div>

      <section className="ck-card" style={{ marginTop: "1.5rem" }} aria-label="Brainstorm activity">
        <h2>Live research and participation</h2>
        <p><strong>Speech timing is not controlled in this prototype.</strong> The agent replies on its normal schedule; OFFER, HOLD, and DISCARD below are advisory decisions only.</p>
        <p><strong>Room:</strong> {humanSpeaking ? "A person is speaking" : "No speech detected"}</p>
        <p><strong>Detected question:</strong> {question ? `${question.question} (${Math.round(question.confidence * 100)}% pattern confidence)` : "None yet"}</p>
        <p><strong>Research:</strong> {researchStatus} — {researchMessage}</p>
        <p><strong>Decision:</strong> {decision.action} — {decision.reason}</p>

        {findings.map((finding) => (
          <article key={finding.questionId} className="ck-card" style={{ marginTop: "1rem" }}>
            <h3>Prepared finding</h3>
            <p>{finding.summary}</p>
            <ul>
              {finding.sources.map((source) => (
                <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>
              ))}
            </ul>
          </article>
        ))}
        {discarded && (
          <article className="ck-card" style={{ marginTop: "1rem" }} role="status">
            <h3>Discarded finding</h3>
            <p>{discarded.finding.question}</p>
            <p><strong>Why:</strong> {discarded.reason}</p>
          </article>
        )}
      </section>

      {error && (
        <article className="ck-card ck-card--gate" style={{ marginTop: "1.5rem" }}>
          <h3>Could not connect</h3>
          <p>{error}</p>
          <p>Check the server-side <code>OPENAI_API_KEY</code> and Realtime access. The microphone needs localhost or HTTPS.</p>
        </article>
      )}

      {transcript.length > 0 && (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>Transcript</h2>
          <pre className="ck-transcript">{transcript.join("\n")}</pre>
        </section>
      )}
    </main>
  );
}
