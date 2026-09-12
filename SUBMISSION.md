# Counterpoint — submission notes

**Counterpoint** is a quiet research partner for a live brainstorm. It detects a concrete uncertainty in the conversation, searches while people keep talking, prepares a short finding with source links, and uses a participation gate to offer, hold, or discard that finding. The browser activity panel shows the reason for each decision.

The implemented surface is **Chrome at `/voice`**, using browser speech recognition and playback. The [Portuguese concept](docs/counterpoint/README-counterpoint-pt.md) and [architecture sketch](docs/counterpoint/architecture.md) describe a Google Meet extension as a next surface. There is no Meet extension, tab capture, company-system connection, or internal MCP integration in this build.

## What was inherited and what was built

**Inherited from the CopilotKit Agents, Everywhere starter kit:** the monorepo and scripts; the CopilotKit web chat and incident/Ambiguous sample at `/`; the original OpenAI Realtime `/voice` route, its [token endpoint](apps/web/src/app/api/realtime-token/route.ts), and [Realtime configuration](apps/web/src/lib/realtime-config.ts); the [Exa search route](apps/web/src/app/api/search/route.ts) and underlying search capability; and the unused Slack and mobile sample apps. These were starting infrastructure, not Counterpoint's event-built core.

**Built during the event:**

- [Uncertainty detection](apps/web/src/lib/uncertainty.ts) for narrow, researchable English and Portuguese questions, with [synthetic transcript tests](apps/web/src/lib/uncertainty.test.ts).
- [Background research and Gemini synthesis](apps/web/src/app/voice/page.tsx), using the inherited Exa route and a new [server-side Gemini Flash-Lite route](apps/web/src/app/api/counterpoint/route.ts). Research is asynchronous, findings have source links, and at most two prepared findings are retained.
- A unified [participation gate](apps/web/src/lib/participation.ts) with [one test suite](apps/web/src/lib/participation.test.ts). Named timing and staleness thresholds govern OFFER, HOLD, and DISCARD. Human speech triggers browser playback cancellation.
- The [browser voice experience and activity panel](apps/web/src/app/voice/page.tsx): transcript, detected question, research status, prepared finding and sources, current decision and reason, plus briefly displayed discard reasons. The original OpenAI Realtime voice client was replaced for this surface because this team's OpenAI API account lacked Realtime credits. Counterpoint now uses Chrome speech input/output and server-side Gemini text generation.

## Evidence for the four judging criteria

| Official criterion | Concrete evidence and limit |
| --- | --- |
| **Core Requirements & Functionality** | Chrome `/voice` takes microphone transcript into [question detection](apps/web/src/lib/uncertainty.ts), calls [Exa](apps/web/src/app/api/search/route.ts) in the background, and displays a sourced finding in the [activity panel](apps/web/src/app/voice/page.tsx). The microphone transcript, live findings, and audible response have been observed with the team's keys. |
| **Innovation & Theme Alignment** | The ambient brainstorm context drives both *what* gets researched and *when* to contribute. [The gate](apps/web/src/lib/participation.ts) can hold during human speech and discard stale or off-topic findings; [the panel](apps/web/src/app/voice/page.tsx) makes restraint visible. These are purpose-built workflow decisions, not a claim that voice assistants cannot research or take turns. |
| **Technical Execution & Integration** | [The voice page](apps/web/src/app/voice/page.tsx) combines interim speech transcript, concurrent search, two-finding queue, Gemini synthesis, and browser speech playback. [Server routes](apps/web/src/app/api/counterpoint/route.ts) and [search](apps/web/src/app/api/search/route.ts) keep API keys off the client. [Gate tests](apps/web/src/lib/participation.test.ts) cover timing, staleness, topic changes, and human interruption. Chrome microphone selection and Gemini availability remain live integration dependencies. |
| **Usefulness & Agentic Experience** | Two people can keep discussing an idea while the agent researches an incidental question. The [panel](apps/web/src/app/voice/page.tsx) shows the answer, sources, and a readable OFFER/HOLD/DISCARD reason; new human speech cancels browser audio. The current detector covers a small set of question forms and the single browser microphone does not identify individual speakers. |

## Verification and honest limits

- `npm run typecheck`: passed after the gate merge and README rename.
- `npm test --workspace web`: 47 passed, 0 failed after the gate merge and README rename. These are offline tests; they do not prove a microphone or speaker works.
- Live Chrome rehearsal: the selected built-in microphone produced transcript text; the English research question appeared, live Exa findings and a Gemini-prepared contribution were shown in the panel, and the team's tester reported hearing Counterpoint's response. The response was initially perceived as silent and then heard, so playback latency still merits checking in the video rehearsal. The panel now reports Chrome playback start, finish, or error separately from the participation decision.
- OpenAI Realtime speech gating A/B/C was not proved. The team could not use its OpenAI API key for Realtime because the account had no API credits. The current implementation is a different, browser-controlled speech path; it should not be described as Realtime `response.create`/`response.cancel`.
- Chrome's speech-recognition service, microphone permissions, the selected input device, Exa, and Gemini must all be available for the live demo. Gemini may temporarily return an overload error; the page then uses a short Exa excerpt. Detection uses a small pattern set, and the timed gate is heuristic rather than a full multiperson turn-taking model. Findings and transcript last only for the browser session.
- A two-person unscripted rehearsal, fresh-clone quickstart, and the final two-minute video remain team tasks. The starter's unused sample apps are not evidence of Counterpoint functionality. The inherited root `npm run verify` is not the requested check; its glob behavior is unreliable here.

Run and credential instructions are in the [README](README.md#run-from-a-clean-clone). Before publishing the repository or video, inspect the material for keys and make sure the narration matches the behavior actually recorded.
