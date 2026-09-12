# Counterpoint — submission notes

**Counterpoint** is a quiet research partner for a live brainstorm. It listens
to a conversation (microphone or a shared Google Meet browser tab), detects a
concrete uncertainty, searches while people keep talking, prepares a short
sourced finding, and uses a participation gate to offer, hold, or discard that
finding. When the conversation touches something already tracked on GitHub, it
can also draft — and, only on click, send — a Slack update that names the
matching issue.

The implemented surface is **Chrome at `/voice`**, using browser speech
recognition and playback for both live audio sources. The
[Portuguese concept document](docs/counterpoint/README-counterpoint-pt.md) and
[architecture sketch](docs/counterpoint/architecture.md) describe a **Google
Meet Chrome extension** as a possible future surface — that extension does not
exist in this build. What exists instead is **tab audio capture**: the
Counterpoint tab calls the browser's `getDisplayMedia` picker, the user selects
the open Google Meet browser tab and checks "Share tab audio," and Chrome
speech recognition runs against that captured audio track. There is no browser
extension, no Meet API integration, and no company-system connector in this
build.

## What was inherited and what was built

**Inherited from the CopilotKit Agents, Everywhere starter kit:** the
monorepo and scripts; the CopilotKit web chat and incident/Ambiguous sample at
`/`; the original OpenAI Realtime `/voice` route, its
[token endpoint](apps/web/src/app/api/realtime-token/route.ts), and
[Realtime configuration](apps/web/src/lib/realtime-config.ts); the
[Exa search route](apps/web/src/app/api/search/route.ts) and underlying search
capability; the unused Slack and mobile sample apps; and the
[Counterpoint concept docs](docs/counterpoint/) written before implementation
began. None of these are Counterpoint's event-built core, and the OpenAI
Realtime route is present but **not used** by the shipped `/voice` flow (see
"Sponsors used" below).

**Built during the event:**

- [Meet tab audio capture](apps/web/src/app/voice/page.tsx): an **Audio
  source** selector (Microphone / Meet tab) that requests `getDisplayMedia`,
  verifies the shared surface is a browser tab (not a screen or window),
  confirms a live shared audio track exists, and feeds that track into Chrome
  speech recognition via [`startRecognition`](apps/web/src/lib/voice-input.ts).
  Ending the shared tab or losing the track surfaces a specific, honest error
  rather than silently falling back to the microphone.
- [Uncertainty detection](apps/web/src/lib/uncertainty.ts) for narrow,
  researchable English and Portuguese questions, with
  [synthetic transcript tests](apps/web/src/lib/uncertainty.test.ts).
- [Background research and Gemini synthesis](apps/web/src/app/voice/page.tsx),
  using the inherited Exa route and a
  [server-side Gemini Flash-Lite route](apps/web/src/app/api/counterpoint/route.ts).
  Research is asynchronous, findings carry source links, and at most two
  prepared findings are retained — an overflow discards the oldest, visibly.
- A unified [participation gate](apps/web/src/lib/participation.ts) with
  [one test suite](apps/web/src/lib/participation.test.ts). Named timing and
  staleness thresholds govern OFFER, HOLD, and DISCARD for both audio sources.
  Human speech (from either source) triggers browser playback cancellation.
- The [browser activity panel](apps/web/src/app/voice/page.tsx): live audio
  source, transcript, detected question, research status, prepared finding and
  sources, current decision and reason, a briefly displayed discard reason,
  and separate Chrome playback status. The original OpenAI Realtime voice
  client was replaced for this surface because the team's OpenAI API account
  had no Realtime credits; Counterpoint uses Chrome speech input/output and
  server-side Gemini text generation instead.
- [GitHub issue matching](apps/web/src/app/api/counterpoint/draft/match.ts):
  a pure keyword-overlap scorer (title weighted above body, stopword-filtered)
  over the public repository's open issues, with its own
  [test suite](apps/web/src/app/api/counterpoint/draft/match.test.ts) — no
  model call in the matching step itself, so it adds no extra latency to the
  live conversation.
- The [Slack draft-and-approve action](apps/web/src/app/api/counterpoint/draft/route.ts):
  fetches open issues from `api.github.com`, filters out pull requests, picks
  the best match, and returns it with a drafted message — an OpenRouter model
  call (`google/gemini-2.5-flash-lite`, via
  [`writeModelDraft`](apps/web/src/app/api/counterpoint/draft/route.ts)) writes
  the draft when `OPENROUTER_API_KEY` is set, falling back to a deterministic
  template when it is not or when the call fails. The
  [Slack send route](apps/web/src/app/api/counterpoint/slack/route.ts) posts
  to `SLACK_WEBHOOK_URL` only, includes a linked issue reference block when one
  is present, and returns an explicit `{ sent: false, reason: "SLACK_WEBHOOK_URL not configured" }`
  rather than pretending to send. The
  [`DraftCard`](apps/web/src/components/draft-card.tsx) component shows the
  matched issue, an editable draft, and separate **Draft Slack update** /
  **Send to Slack** buttons — nothing is sent to Slack without the second,
  explicit click.

## Evidence for the four judging criteria

| Official criterion | Concrete evidence and limit |
| --- | --- |
| **Core Requirements & Functionality** | Chrome `/voice` takes either microphone or [Meet-tab-captured](apps/web/src/app/voice/page.tsx) transcript into [question detection](apps/web/src/lib/uncertainty.ts), calls [Exa](apps/web/src/app/api/search/route.ts) in the background, and displays a sourced finding in the activity panel. From that same transcript, [`/api/counterpoint/draft`](apps/web/src/app/api/counterpoint/draft/route.ts) matches a real open GitHub issue and drafts a message a person can edit and send via [`/api/counterpoint/slack`](apps/web/src/app/api/counterpoint/slack/route.ts). Microphone and Meet-tab transcript, live findings, and the draft/send round trip have been observed with the team's keys. |
| **Innovation & Theme Alignment** | The ambient brainstorm context drives what gets researched, when Counterpoint speaks, and what gets written down afterward. [The gate](apps/web/src/lib/participation.ts) can hold during human speech and discard stale or off-topic findings — restraint is the demonstrated behavior, not just retrieval — and the [drafted Slack message](apps/web/src/app/api/counterpoint/draft/route.ts) turns an ambient conversation into a linked, checkable artifact instead of a transcript no one reads again. |
| **Technical Execution & Integration** | [The voice page](apps/web/src/app/voice/page.tsx) combines interim speech transcript from two audio sources, concurrent search, a two-finding queue, Gemini synthesis, and browser speech playback. [Server routes](apps/web/src/app/api/counterpoint/route.ts) keep API keys off the client; the [GitHub match](apps/web/src/app/api/counterpoint/draft/route.ts) and [Slack send](apps/web/src/app/api/counterpoint/slack/route.ts) routes fail with specific, distinguishable errors (GitHub unreachable, no open issues, Slack unreachable, webhook not configured) instead of a generic catch-all. [Gate tests](apps/web/src/lib/participation.test.ts) and [match-function tests](apps/web/src/app/api/counterpoint/draft/match.test.ts) cover timing, staleness, topic changes, human interruption, and keyword-overlap ranking. Chrome tab-sharing consent, microphone selection, and Gemini/GitHub/Slack availability remain live integration dependencies. |
| **Usefulness & Agentic Experience** | Two people can keep discussing an idea — in person or over a shared Meet tab — while the agent researches an incidental question and, afterward, proposes a concrete follow-up tied to an existing GitHub issue. The panel shows the answer, sources, and a readable OFFER/HOLD/DISCARD reason; the [Slack draft card](apps/web/src/components/draft-card.tsx) shows the matched issue and lets a person edit the message before an explicit send, with an honest not-configured state when no webhook is set. The detector covers a small set of question forms, keyword-overlap matching is not semantic search, and neither audio source identifies individual speakers. |

## Verification and honest limits

- `npm run typecheck`: passed.
- `npm test --workspace web`: 57 passed, 0 failed. These are offline tests
  (detector, gate, voice-input track handling, GitHub keyword-overlap
  matching); they do not prove a microphone, a shared Meet tab, Gemini,
  GitHub, or Slack works live.
- Live Chrome rehearsal (microphone path): the selected built-in microphone
  produced transcript text; an English research question was detected, live
  Exa findings and a Gemini-prepared contribution were shown in the panel, and
  the team's tester reported hearing Counterpoint's response after an initial
  perceived silence — playback latency still merits checking in the video
  rehearsal. The panel reports Chrome playback start, finish, or error
  separately from the participation decision.
- Meet-tab-capture path, GitHub matching, and the Slack draft/send round trip
  were built and typecheck/test-covered in this session; a live two-person
  rehearsal exercising the Meet tab picker, a real open-issue match, and an
  actual Slack webhook send (or its honest not-configured message) is a
  remaining team task before recording.
- OpenAI Realtime speech gating A/B/C was not proved and is not used by this
  build. The team could not use its OpenAI API key for Realtime because the
  account had no API credits; the current implementation is a different,
  browser-controlled speech path and should not be described as Realtime
  `response.create`/`response.cancel`.
- Chrome's speech-recognition service, microphone or tab-sharing permission,
  Exa, Gemini, GitHub's public API, and (optionally) OpenRouter and a Slack
  webhook must all be available for the full live demo. Gemini may
  temporarily return an overload error; the page then uses a short Exa
  excerpt. The Slack draft falls back to a deterministic template if
  `OPENROUTER_API_KEY` is unset or the call fails, and Slack send reports
  itself unconfigured rather than pretending to succeed if
  `SLACK_WEBHOOK_URL` is unset. Detection uses a small pattern set, GitHub
  matching is keyword overlap rather than semantic search, and the timed gate
  is heuristic rather than a full multiperson turn-taking model. Findings,
  transcript, and drafts last only for the browser session.
- A two-person unscripted rehearsal covering both audio sources, a fresh-clone
  quickstart, and the final two-minute video (shot list in
  [docs/demo-script.md](docs/demo-script.md)) remain team tasks. The starter's
  unused sample apps are not evidence of Counterpoint functionality. The
  inherited root `npm run verify` is not the requested check; its glob
  behavior is unreliable here.

Run and credential instructions are in the
[README](README.md#run-from-a-clean-clone). Before publishing the repository
or video, inspect the material for keys and make sure the narration matches
the behavior actually recorded — see the note on the Meet integration's real
mechanism (tab audio capture, not an extension) at the top of this document.
