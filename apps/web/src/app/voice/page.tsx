"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectUncertainty, type DetectedQuestion } from "@/lib/uncertainty";
import { startRecognition } from "@/lib/voice-input";
import {
  decideParticipation,
  initialParticipationState,
  reduceParticipation,
  transition,
  type ParticipationDecision,
} from "@/lib/participation";

type Status = "idle" | "connecting" | "live" | "error";
type InputSource = "microphone" | "meet-tab";
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
  start(audioTrack?: MediaStreamTrack): void;
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
  const [inputSource, setInputSource] = useState<InputSource>("microphone");
  const [liveSource, setLiveSource] = useState<InputSource | null>(null);
  const [language, setLanguage] = useState("en-US");
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
  const [playbackMessage, setPlaybackMessage] = useState("No audio requested yet.");

  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const runningRef = useRef(false);
  const participationRef = useRef(initialParticipationState);
  const findingsRef = useRef<PreparedFinding[]>([]);
  const seenQuestionsRef = useRef(new Set<string>());
  const seenFinalRef = useRef(new Set<string>());
  const seenTopicChangesRef = useRef(new Set<string>());
  const spokenRef = useRef(new Set<string>());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const recognitionRunRef = useRef(0);

  const speakFinding = useCallback((finding: PreparedFinding) => {
    if (!runningRef.current || spokenRef.current.has(finding.questionId)) return;
    spokenRef.current.add(finding.questionId);
    const utterance = new SpeechSynthesisUtterance(finding.summary);
    utteranceRef.current = utterance;
    utterance.lang = language;
    utterance.rate = 1.05;
    setPlaybackMessage("Finding sent to Chrome speech playback; waiting for audio to start.");
    utterance.onstart = () => {
      participationRef.current = transition(participationRef.current, { type: "agent_audio_started", at: Date.now(), candidateId: finding.questionId }).state;
      setAgentSpeaking(true);
      setPlaybackMessage("Chrome started speaking the finding.");
    };
    utterance.onend = () => {
      participationRef.current = transition(participationRef.current, { type: "agent_audio_ended", at: Date.now(), candidateId: finding.questionId }).state;
      setAgentSpeaking(false);
      utteranceRef.current = null;
      setPlaybackMessage("Chrome finished speaking the finding.");
    };
    utterance.onerror = (event) => {
      participationRef.current = transition(participationRef.current, { type: "agent_audio_ended", at: Date.now(), candidateId: finding.questionId }).state;
      setAgentSpeaking(false);
      utteranceRef.current = null;
      setPlaybackMessage(`Chrome speech playback failed: ${event.error}.`);
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [language]);

  const testSpeaker = useCallback(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Counterpoint speaker test.");
    utteranceRef.current = utterance;
    utterance.lang = language;
    setPlaybackMessage("Speaker test sent to Chrome; waiting for audio to start.");
    utterance.onstart = () => setPlaybackMessage("Chrome started the speaker test.");
    utterance.onend = () => {
      utteranceRef.current = null;
      setPlaybackMessage("Chrome finished the speaker test.");
    };
    utterance.onerror = (event) => {
      utteranceRef.current = null;
      setPlaybackMessage(`Chrome speaker test failed: ${event.error}.`);
    };
    window.speechSynthesis.speak(utterance);
  }, [language]);

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
      setDecision({ action: "HOLD", reason: current.length ? "Playback was requested for the prepared finding; see Audio status." : "Waiting for a prepared finding." });
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
        const result = (await synthesis.json()) as { text?: string; model?: string; error?: string };
        if (!synthesis.ok || !result.text) throw new Error(result.error ?? "Gemini returned no text.");
        summary = result.text;
        synthesisNote = `${result.model ?? "Gemini Flash-Lite"} prepared this contribution.`;
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
    captureStreamRef.current?.getTracks().forEach((track) => track.stop());
    captureStreamRef.current = null;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    if (restartRef.current) clearTimeout(restartRef.current);
    tickRef.current = null;
    restartRef.current = null;
    setHumanSpeaking(false);
    setAgentSpeaking(false);
    setLiveSource(null);
    setStatus("idle");
  }, []);

  const connect = useCallback(async (source: InputSource) => {
    disconnect();
    const browser = window as SpeechBrowser;
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition || !window.speechSynthesis) {
      setError("This browser does not support speech recognition and playback. Use Chrome for the demo.");
      setStatus("error");
      return;
    }
    const generation = generationRef.current;
    let audioTrack: MediaStreamTrack | undefined;
    if (source === "meet-tab") {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setError("This browser cannot capture tab audio. Use Chrome or switch to Microphone.");
        setStatus("error");
        return;
      }
      setError(undefined);
      setStatus("connecting");
      try {
        // The browser requires video in the request even though Counterpoint
        // consumes audio only. Check the selected surface, then stop video.
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const videoTracks = stream.getVideoTracks();
        const displaySurface = videoTracks[0]?.getSettings().displaySurface;
        videoTracks.forEach((track) => track.stop());
        if (generation !== generationRef.current) {
          stream.getAudioTracks().forEach((track) => track.stop());
          return;
        }
        if (displaySurface && displaySurface !== "browser") {
          stream.getAudioTracks().forEach((track) => track.stop());
          setError("Select the Google Meet browser tab, not an entire screen or window, then enable Share tab audio.");
          setStatus("error");
          return;
        }
        audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack || audioTrack.readyState !== "live") {
          stream.getAudioTracks().forEach((track) => track.stop());
          setError('No tab audio was shared. Select the Google Meet tab and re-share with "Share tab audio" checked.');
          setStatus("error");
          return;
        }
        captureStreamRef.current = stream;
        audioTrack.addEventListener("ended", () => {
          if (generation !== generationRef.current) return;
          disconnect();
          setError("Meet tab sharing ended. Choose Listen to a Meet tab to share it again.");
          setStatus("error");
        }, { once: true });
      } catch (cause) {
        if (generation !== generationRef.current) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError((cause instanceof DOMException && cause.name === "InvalidStateError") || message === "Invalid state"
          ? "Keep the Counterpoint tab focused, then click Listen to a Meet tab again."
          : `Meet tab sharing failed: ${message}`);
        setStatus("error");
        return;
      }
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
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
    setPlaybackMessage("No audio requested yet.");
    setError(undefined);
    setStatus("connecting");

    recognition.onstart = () => {
      recognitionRunRef.current += 1;
      setLiveSource(source);
      setStatus("live");
    };
    recognition.onspeechstart = () => {
      const now = Date.now();
      setHumanSpeaking(true);
      const result = transition(participationRef.current, { type: "speech_started", at: now });
      participationRef.current = result.state;
      if (result.actions.some((action) => action.type === "cancel_agent_audio") || window.speechSynthesis.pending) window.speechSynthesis.cancel();
      evaluateDecision(now);
    };
    recognition.onspeechend = () => {
      const now = Date.now();
      setHumanSpeaking(false);
      participationRef.current = transition(participationRef.current, { type: "speech_stopped", at: now }).state;
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
      setError(`Speech recognition failed on ${source === "meet-tab" ? "Meet tab" : "Microphone"}: ${event.error}.`);
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "network") {
        disconnect();
        setError(`Speech recognition failed on ${source === "meet-tab" ? "Meet tab" : "Microphone"}: ${event.error}.`);
        setStatus("error");
      }
    };
    recognition.onend = () => {
      if (!runningRef.current || generation !== generationRef.current) return;
      restartRef.current = setTimeout(() => {
        if (!runningRef.current) return;
        try {
          startRecognition(recognition, audioTrack);
        } catch {
          disconnect();
          setStatus("error");
          setError("Speech recognition could not restart.");
        }
      }, 150);
    };
    try {
      startRecognition(recognition, audioTrack);
      tickRef.current = setInterval(() => evaluateDecision(Date.now()), 250);
    } catch (cause) {
      disconnect();
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, [detectFromTranscript, disconnect, evaluateDecision, language]);

  useEffect(() => () => {
    generationRef.current += 1;
    runningRef.current = false;
    recognitionRef.current?.stop();
    captureStreamRef.current?.getTracks().forEach((track) => track.stop());
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
        <label>Audio source{" "}
          <select value={inputSource} onChange={(event) => setInputSource(event.target.value as InputSource)} disabled={status === "live" || status === "connecting"}>
            <option value="microphone">Microphone</option>
            <option value="meet-tab">Meet tab</option>
          </select>
        </label>
        <label>Recognition language{" "}
          <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={status === "live" || status === "connecting"}>
            <option value="en-US">English</option>
            <option value="pt-BR">Português (Brasil)</option>
          </select>
        </label>
        {status === "live" ? (
          <button type="button" className="ck-btn" onClick={disconnect}>End call</button>
        ) : (
          <button type="button" className="ck-btn ck-btn--primary" onClick={() => void connect(inputSource)} disabled={status === "connecting"}>
            {status === "connecting" ? "Connecting…" : inputSource === "meet-tab" ? "Listen to a Meet tab" : "Start talking"}
          </button>
        )}
        <span className="ck-status" data-status={status}>{status}</span>
        <button type="button" className="ck-btn" onClick={testSpeaker}>Test speaker</button>
      </div>

      <section className="ck-card" style={{ marginTop: "1.5rem" }} aria-label="Brainstorm activity">
        <h2>Live research and participation</h2>
        <p>Chrome handles speech recognition and playback. Gemini Flash-Lite drafts from Exa sources. Counterpoint speaks only on OFFER; new human speech cancels playback.</p>
        <p><strong>Live source:</strong> {liveSource === "meet-tab" ? "Meet tab" : liveSource === "microphone" ? "Microphone" : "None"}</p>
        <p><strong>Room:</strong> {agentSpeaking ? "Counterpoint is speaking" : humanSpeaking ? "A person is speaking" : "No speech detected"}</p>
        <p><strong>Detected question:</strong> {question ? `${question.question} (${Math.round(question.confidence * 100)}% pattern confidence)` : "None yet"}</p>
        <p><strong>Research:</strong> {researchStatus} — {researchMessage}</p>
        <p><strong>Decision:</strong> {decision.action} — {decision.reason}</p>
        <p><strong>Audio:</strong> {playbackMessage}</p>

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
          <p>{inputSource === "meet-tab"
            ? 'Use Chrome on localhost or HTTPS, select the Google Meet tab, and enable "Share tab audio".'
            : "Use Chrome on localhost or HTTPS and allow microphone access."}</p>
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
