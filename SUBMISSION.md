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

Verified, real progress as of this writing:

- A feasibility spike in `apps/web/src/app/voice/page.tsx` proving the two mechanics the concept depends on: (1) the Realtime session can be configured to detect speech without auto-responding (`turnDetection: { type: "semantic_vad", createResponse: false, interruptResponse: false }`), so the agent can stay silent while humans talk, and (2) an application-controlled speaking gate — explicit "Ask agent to speak" / "Stop agent" buttons calling `session.transport.sendEvent({ type: "response.create" })` and `session.interrupt()` — with a visible transport-event log confirming the gate actually held or cancelled a response.
- **As of this writing, this change is uncommitted in the working tree** (see `git diff apps/web/src/app/voice/page.tsx`) and was still being iterated on by a teammate's agent while this submission file was written. Confirm it has landed on `main` before citing it as final.

<!-- TODO(team): the uncertainty detector, the background-research trigger, the
relevance check, and the offer/hold/discard decision logic described in
TEAM_HANDOFF.md's prototype scope are NOT implemented as of this writing — no
files exist yet under `apps/web/src/lib/brainstorm/` or an activity-panel
component under `apps/web/src/components/`. Do not describe them as built
until they exist and pass typecheck/tests; when they land, list the actual
files here (module paths, the panel component, and any new tests) in place of
this TODO. Do not invent file paths or a demo result for this section. -->

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

<!-- TODO(team): fill in once the uncertainty-detection and relevance-check
logic exist. The honest answer today is: the agent knows what was said (via
the Realtime session's transcript) and can be prevented from responding
automatically (verified in the `apps/web/src/app/voice/page.tsx` spike), but
it does not yet decide *when* to speak based on the conversation's content —
that decision logic is what would make "living in this surface" load-bearing,
and it is not built yet. -->

**Sponsor technologies used**

- **OpenAI Realtime** — the WebRTC voice session at `/voice` (`apps/web/src/app/voice/page.tsx`), configured with `semantic_vad` turn detection and `createResponse: false` so speech can be held without an automatic reply.
- **Exa** — `packages/agent-core/src/capabilities/search.ts`, exposed to the voice agent as the `search_web` tool via `apps/web/src/app/api/search/route.ts`. <!-- TODO(team): this is the inherited on-demand search tool, not yet the automatic background-research trigger the concept calls for; note that distinction in the demo. -->
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

- **Core Requirements & Functionality** — <!-- TODO(team): not yet demonstrable end-to-end. --> The only verified live path today is: open `/voice`, connect a Realtime session, speak, confirm the agent stays silent (`turnDetection.createResponse: false` in `apps/web/src/app/voice/page.tsx`), then manually trigger or cancel a response and see it reflected in the on-page event log. That is a control-path spike, not the research-and-participation workflow. Do not claim the full workflow runs until the uncertainty→research→offer/hold/discard chain exists and has been run live with two speakers per TEAM_HANDOFF.md's rehearsal step.
- **Innovation & Theme Alignment** — The intended original interaction (an agent that researches silently and interjects only when its finding is still relevant) is written up in TEAM_HANDOFF.md's "Confirmed direction" section, but the code that would let a judge see it — the uncertainty detector and relevance check — does not exist yet. <!-- TODO(team): once built, point here at the specific module that decides offer vs. hold vs. discard, and contrast a run with that module disabled. -->
- **Technical Execution & Integration** — Real, checkable integration points: the ephemeral-secret exchange in `apps/web/src/app/api/realtime-token/route.ts` (server never exposes `OPENAI_API_KEY` to the browser), and the server-side Exa proxy in `apps/web/src/app/api/search/route.ts` (browser tool never sees `EXA_API_KEY`; returns an explicit "not configured" string rather than failing silently when the key is absent — `packages/agent-core/src/capabilities/search.ts:25`). The cancellation path is demonstrated: `cancelResponse` in `apps/web/src/app/voice/page.tsx` calls `session.interrupt()` and the event log shows it took effect. <!-- TODO(team): no evidence yet for the research call's own failure/cancellation path (e.g., a stale finding discarded mid-research), since that code doesn't exist. -->
- **Usefulness & Agentic Experience** — <!-- TODO(team): cannot honestly claim this yet. --> The manual "Ask agent to speak" / "Stop agent" controls in `apps/web/src/app/voice/page.tsx` show a real, working form of user control over agent speech, which is a prerequisite for the intended "offer only at an appropriate opening" behavior — but the behavior itself (the agent deciding when to offer) is not built, so there is no evidence yet of the agent saving anyone research time unattended.

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
