"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectUncertainty, type DetectedQuestion } from "@/lib/uncertainty";
import {
  decideParticipation,
  initialParticipationState,
  reduceParticipation,
  type ParticipationDecision,
} from "@/lib/participation";

type Status = "idle" | "connecting" | "live" | "error";
type ResearchStatus = "idle" | "searching" | "synthesizing" | "ready" | "unavailable";
type SearchHit = { title: string; url: string; highlight?: string };
type PreparedFinding = {
  questionId: string;
  question: string;
  summary: string;
  sources: SearchHit[];
  detectedAt: number;
};

type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
type SpeechBrowser = Window & {
  SpeechRecognition?: new () => BrowserRecognition;
  webkitSpeechRecognition?: new () => BrowserRecognition;
};

const TOPIC_CHANGE = /\b(?:moving on|different topic|change (?:the )?subject|let'?s (?:move on|talk about something else)|mudando de assunto|outro assunto|vamos falar de outra coisa)\b/i;

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
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const runningRef = useRef(false);
  const participationRef = useRef(initialParticipationState);
  const findingsRef = useRef<PreparedFinding[]>([]);
  const seenQuestionsRef = useRef(new Set<string>());
  const seenFinalRef = useRef(new Set<string>());
  const seenTopicChangesRef = useRef(new Set<string>());
  const spokenRef = useRef(new Set<string>());
  const agentSpeakingRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const recognitionRunRef = useRef(0);

  const speakFinding = useCallback((finding: PreparedFinding) => {
    if (!runningRef.current || spokenRef.current.has(finding.questionId)) return;
    spokenRef.current.add(finding.questionId);
    const utterance = new SpeechSynthesisUtterance(finding.summary);
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 1.05;
    utterance.onstart = () => { agentSpeakingRef.current = true; setAgentSpeaking(true); };
    utterance.onend = utterance.onerror = () => { agentSpeakingRef.current = false; setAgentSpeaking(false); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const evaluateDecision = useCallback((now: number) => {
    let current = findingsRef.current;
    for (const finding of current) {
      const next = decideParticipation(participationRef.current, now, finding.questionId);
      if (next.action === "DISCARD" && !spokenRef.current.has(finding.questionId)) {
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
    const latest = [...current].reverse().find((item) => !spokenRef.current.has(item.questionId));
    if (!latest) {
      setDecision({ action: "HOLD", reason: current.length ? "The prepared finding was spoken." : "Waiting for a prepared finding." });
      return;
    }
    const next = decideParticipation(participationRef.current, now, latest.questionId);
    setDecision(next);
    if (next.action === "OFFER") speakFinding(latest);
  }, [speakFinding]);

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
      setResearchStatus("synthesizing");
      setResearchMessage("Exa found sources; Gemini Flash-Lite is preparing a short contribution.");
      let summary = shortFinding(hits[0]);
      let synthesisNote = "Gemini Flash-Lite prepared this contribution.";
      try {
        const synthesis = await fetch("/api/counterpoint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: detected.question, sources: hits }),
        });
        const result = (await synthesis.json()) as { text?: string; error?: string };
        if (!synthesis.ok || !result.text) throw new Error(result.error ?? "Gemini returned no text.");
        summary = result.text;
      } catch (cause) {
        synthesisNote = `Gemini unavailable; using an Exa source excerpt. ${cause instanceof Error ? cause.message : ""}`;
      }
      if (generation !== generationRef.current) return;
      const finding: PreparedFinding = {
        questionId,
        question: detected.question,
        summary,
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
      setResearchMessage(synthesisNote);
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

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    runningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    window.speechSynthesis.cancel();
    agentSpeakingRef.current = false;
    if (tickRef.current) clearInterval(tickRef.current);
    if (restartRef.current) clearTimeout(restartRef.current);
    tickRef.current = null;
    restartRef.current = null;
    setHumanSpeaking(false);
    setAgentSpeaking(false);
    setStatus("idle");
  }, []);

  const connect = useCallback(() => {
    disconnect();
    const browser = window as SpeechBrowser;
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition || !window.speechSynthesis) {
      setError("This browser does not support speech recognition and playback. Use Chrome for the demo.");
      setStatus("error");
      return;
    }
    const generation = generationRef.current;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognitionRef.current = recognition;
    runningRef.current = true;
    participationRef.current = initialParticipationState;
    findingsRef.current = [];
    seenQuestionsRef.current.clear();
    seenFinalRef.current.clear();
    seenTopicChangesRef.current.clear();
    spokenRef.current.clear();
    recognitionRunRef.current = 0;
    setQuestion(null);
    setFindings([]);
    setDiscarded(null);
    setTranscript([]);
    setResearchStatus("idle");
    setResearchMessage("Waiting for a researchable question.");
    setDecision({ action: "HOLD", reason: "Waiting for a prepared finding." });
    setError(undefined);
    setStatus("connecting");

    recognition.onstart = () => {
      recognitionRunRef.current += 1;
      setStatus("live");
    };
    recognition.onspeechstart = () => {
      const now = Date.now();
      setHumanSpeaking(true);
      participationRef.current = reduceParticipation(participationRef.current, { type: "speech_started", at: now });
      if (agentSpeakingRef.current) window.speechSynthesis.cancel();
      evaluateDecision(now);
    };
    recognition.onspeechend = () => {
      const now = Date.now();
      setHumanSpeaking(false);
      participationRef.current = reduceParticipation(participationRef.current, { type: "speech_stopped", at: now });
      evaluateDecision(now);
    };
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript?.trim();
        if (!text) continue;
        const itemId = `${generation}:${recognitionRunRef.current}:${index}`;
        detectFromTranscript(text, itemId);
        if (!result.isFinal || seenFinalRef.current.has(itemId)) continue;
        seenFinalRef.current.add(itemId);
        setTranscript((previous) => [...previous, `human  ${text}`]);
        if (TOPIC_CHANGE.test(text) && !seenTopicChangesRef.current.has(itemId)) {
          seenTopicChangesRef.current.add(itemId);
          const now = Date.now();
          participationRef.current = reduceParticipation(participationRef.current, { type: "topic_changed", at: now });
          evaluateDecision(now);
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(`Microphone recognition failed: ${event.error}.`);
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "network") {
        runningRef.current = false;
        setStatus("error");
      }
    };
    recognition.onend = () => {
      if (!runningRef.current || generation !== generationRef.current) return;
      restartRef.current = setTimeout(() => {
        if (!runningRef.current) return;
        try { recognition.start(); } catch { setStatus("error"); setError("Speech recognition could not restart."); }
      }, 150);
    };
    try {
      recognition.start();
      tickRef.current = setInterval(() => evaluateDecision(Date.now()), 250);
    } catch (cause) {
      runningRef.current = false;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, [detectFromTranscript, disconnect, evaluateDecision]);

  useEffect(() => () => {
    runningRef.current = false;
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    if (tickRef.current) clearInterval(tickRef.current);
    if (restartRef.current) clearTimeout(restartRef.current);
    if (discardTimerRef.current) clearTimeout(discardTimerRef.current);
  }, []);

  return (
    <main className="ck-page">
      <p className="ck-eyebrow">In the room</p>
      <h1>Counterpoint</h1>
      <p className="ck-dek">A quiet research partner for live brainstorming. Ask a concrete question; Counterpoint researches it while you keep talking.</p>

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
        <p>Chrome handles speech recognition and playback. Gemini Flash-Lite drafts from Exa sources. Counterpoint speaks only on OFFER; new human speech cancels playback.</p>
        <p><strong>Room:</strong> {agentSpeaking ? "Counterpoint is speaking" : humanSpeaking ? "A person is speaking" : "No speech detected"}</p>
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
          <h3>Voice unavailable</h3>
          <p>{error}</p>
          <p>Use Chrome on localhost or HTTPS and allow microphone access.</p>
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
