# Submission checklist

Choose your city on the [global event page](https://aitinkerers.org/hackathons/global/agents-everywhere). Use that city's participant portal for the submission deadline and published judging criteria, and its handbook for eligibility and required deliverables. See [hackathon-rules.md](hackathon-rules.md) for the agent-readable summary.

## Build eligibility

- [ ] Our submitted project is a net-new build created during the official hackathon period
- [ ] Its core functionality was built during the event; we are not resubmitting or extending a pre-existing project and entering it as new
- [ ] We identify inherited templates, libraries, prompts, components, and starter code separately from our event work

**What we inherited**

- The [CopilotKit Agents-Everywhere starter kit](https://github.com/CopilotKit/agents-everywhere-starter-kit) checkout itself: repo layout, `AGENTS.md` conventions, root `package.json` scripts, and the three template apps under `apps/`.
- The web app's `/voice` Realtime route (`apps/web/src/app/voice/page.tsx`) as it stood before this event's edits: a WebRTC `RealtimeSession` against OpenAI Realtime, an ephemeral-secret token route (`apps/web/src/app/api/realtime-token/route.ts`), a shared system prompt (`packages/agent-core/src/prompt.ts`), and a `history_updated` transcript listener. It displayed transcripts and allowed ordinary voice-agent responses; it had no application-controlled speaking gate.
- The Exa-backed search capability: `packages/agent-core/src/capabilities/search.ts` (surface-agnostic `searchWeb`), wired into the voice route via `apps/web/src/app/api/search/route.ts` (server-side, so the browser-executed tool never sees `EXA_API_KEY`) and into the Slack template via `apps/channel/src/search.tsx`.
- The incident/Ambiguous sample app in `apps/web` (`apps/web/src/app/page.tsx`, `apps/web/src/lib/incidents.ts`, `apps/web/src/components/workplace-followups.tsx`, `apps/web/src/lib/server/workplace.ts`) — a full propose/approve/save-to-Ambiguous workplace-record demo. We did not use it or its Ambiguous integration.
- The mobile finance sample app (`apps/mobile/src/finance.ts`, `apps/mobile/src/tools.tsx`, `apps/mobile/src/chat.tsx`) and the Slack incident-thread sample in `apps/channel`. We did not build on either template; this project's surface is the web app's `/voice` route only.

**What we built during the hackathon**

The concept (recorded in [TEAM_HANDOFF.md](TEAM_HANDOFF.md)): an agent that joins a live two-person brainstorm over one shared microphone, silently starts read-only research when someone raises a concrete uncertainty, and offers a short sourced finding only if the topic is still relevant when it finishes — holding or discarding it otherwise.

Implemented code as of this writing:

- `apps/web/src/lib/uncertainty.ts` detects a narrow set of researchable questions from transcript text; `uncertainty.test.ts` covers clear, rhetorical, statement, and incremental cases.
- `apps/web/src/lib/participation.ts` decides OFFER, HOLD, or DISCARD from timestamped speech, question, finding, and topic-change events; `participation.test.ts` covers speech, silence, staleness, and topic changes.
- `apps/web/src/app/voice/page.tsx` listens for raw input-transcription deltas, starts an asynchronous call to the inherited Exa route, retains at most two prepared findings, and displays sources and decision reasons in the activity panel. Explicit topic-change phrases and elapsed time can discard a finding.

**Fallback status:** application-controlled speech was not proved. The live browser attempt reached `/voice` but OpenAI rejected the configured `OPENAI_API_KEY` because it is a placeholder. No A/B/C speech-control result could be observed. The current page leaves normal Realtime voice responses enabled and labels OFFER/HOLD/DISCARD as an **advisory decision layer that is not wired to speech timing**. Do not claim that the agent only speaks when OFFER is shown. The local search route was called and returned “no EXA_API_KEY”; no live Exa finding has been verified.

## Title and description

**What you built**

<!-- TODO(team): the working title in TEAM_HANDOFF.md is unconfirmed ("project
name is not decided"; an older commit mentions "cloud9" as prior working
context only). Do not invent a final title or a finished-demo description
here — write this once the offer/hold/discard interaction in TEAM_HANDOFF.md
actually runs, and describe only the interaction the recorded demo shows. -->

**Who it is for**

Two people mid-brainstorm who want a research assistant that listens without interrupting: it stays silent through normal conversation and only speaks up when it has something sourced and still relevant to add.

**Why the context matters**

The decision layer uses what participants say and when they speak to assess whether a researched finding remains useful. It is visible on the voice page. Its connection to actual speech timing remains unverified and disabled in the fallback build.

**Sponsor technologies used**

- **OpenAI Realtime** — the inherited WebRTC voice session at `/voice`; the current fallback uses its normal response timing. A valid key and live test are still required.
- **Exa** — the inherited server-side search route is now called asynchronously when the new detector finds a question. `EXA_API_KEY` is absent in the tested environment, so live search is not yet demonstrated.
- CopilotKit Channels/React and Ambiguous AI, present in the inherited starter kit, are not used by this project's surface.

## Evidence for the judging criteria

Judges score each of the four official criteria from 1–5. This checklist helps you gather evidence; it does not guarantee a score. A working starter is a foundation for your own project.

| Official criterion | Show in your project and demo |
|---|---|
| Core Requirements & Functionality | Run one complete workflow in the intended environment, from user request through tools to a verified result. Repeat it with live integrations; offline tests alone do not prove the deployed flow. |
| Innovation & Theme Alignment | Show the surrounding context before the prompt and explain the original interaction it enables. Compare with the context removed: what value would a standalone chatbox lose? |
| Technical Execution & Integration | Show how tools, data, and the environment connect. Demonstrate a relevant failure or cancellation path and explain recovery, state persistence, and integration limits. |
| Usefulness & Agentic Experience | Identify the user and problem, show a meaningful action in the surface, and demonstrate clear feedback and appropriate user control. Explain what work the agent saves. |

**Our evidence, by criterion**

- **Core Requirements & Functionality** — The detector, asynchronous search trigger, two-finding queue, decision rules, and visible panel are implemented. Typecheck and 42 web tests pass. A full two-person, live-credential run has not been completed.
- **Innovation & Theme Alignment** — The new modules assess uncertainty, floor availability, and staleness. The fallback's panel exposes those decisions, while Realtime still controls its own speech timing.
- **Technical Execution & Integration** — The inherited token route keeps the OpenAI key server-side and the Exa route keeps its key server-side. A browser attempt confirmed the token route rejects the placeholder OpenAI key; a local route call confirmed the missing-Exa message. Speech cancellation was not verified live.
- **Usefulness & Agentic Experience** — The panel shows why a finding is prepared, held, or discarded. Its real-world benefit and spoken turn-taking still need a live rehearsal with two people and valid credentials.

- [ ] We can point to visible evidence for every criterion
- [ ] We distinguish live services, sample data, session-only state, and standalone recipes
- [ ] Sponsor technologies contribute to the workflow; their count is not a judging criterion

## Public repository

<!-- TODO(team): the quickstart below was checked against this checkout's
current file layout, but was not run start-to-finish from an actual fresh
`git clone` in a clean directory. Do that once before submitting. -->
- [ ] A new participant can run the quickstart from a clean clone
- [x] The README lists the credentials and separate processes required — see [README.md](README.md#get-started) (`OPENAI_API_KEY`, `EXA_API_KEY`, `npm run dev:web`, open `/voice`)
- [x] `npm run verify` passes — fixed the quoted `**` glob in `packages/agent-core/package.json` and `apps/channel/package.json` that made Node's test runner fail to resolve any files; confirmed exit code 0 with typecheck + all three workspaces' tests (web 34 tests, channel, agent-core) passing
- [ ] `.env`, tokens, generated traces with sensitive data, and account secrets are excluded
- [ ] Sample data, session-only state, and unimplemented integrations are clearly labeled

## Two-minute demo video

- [ ] Show the surface and existing context before the prompt
- [ ] Demonstrate one complete interaction
- [ ] Show a visible result: an actual record, local state change, or research source links
- [ ] If showing an approval, distinguish the decision from execution and demonstrate the resulting behavior
- [ ] State which sponsor technologies made the interaction possible
- [ ] Keep the video within the event's limit and check audio

See [demo prompts](dev-docs/demo-prompts.md) for a reproducible incident workflow.

## Social post and final submission

- [ ] Follow the organizer's posting and sponsor-tagging instructions
- [ ] Link the public repository and video
- [ ] Credit the sponsors you used and applicable local partners
- [ ] Check the live integration once more before recording or submitting
- [ ] Inspect the repository, video and screenshots for secrets

Prepare the post and submission for a human to publish; running the starter kit
does not publish either automatically.
