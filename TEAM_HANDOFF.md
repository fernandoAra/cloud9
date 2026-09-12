# Team handoff — live brainstorm agent

Last updated: 2026-09-12. Working concept; project name is **not decided**.

## Confirmed direction

Two people are developing this project concurrently during the hackathon, and either may use Codex or Claude Code. The agent joins a live brainstorm between humans. When someone raises a concrete uncertainty, such as “does this already exist?”, it starts read-only research while the discussion continues. It prepares a short, sourced finding or concept preview. It offers that contribution only if the topic is still relevant and there is an appropriate opening; otherwise it holds or discards it. The useful behavior is the research-and-participation harness, not a silence timer or a general voice chatbot.

The repo was copied from the Agents, Everywhere starter kit. The browser `apps/web/src/app/voice/page.tsx` is the likely first surface. The incident web app, Slack app, and mobile app are inherited examples, not this project's implemented workflow. Company-system context and a preview are potential next steps, not confirmed MVP requirements. No project title has been chosen; the GitHub repository slug and an older commit mention `cloud9` only as prior working context.

## Current state and cautions

- At this handoff's creation, the checkout was on `main` with an existing uncommitted edit to `AGENTS.md`. Do not overwrite or revert that edit. The latest commit contains an older project brief focused on a turn-gap gate; the working-tree edit removes that brief. The current concept above supersedes that older brief for planning.
- `/voice` already has a WebRTC Realtime session, a server endpoint for an ephemeral client secret, and a server-side Exa search route. It currently displays history updates and allows ordinary voice-agent responses. It does **not** implement early uncertainty detection, background research, relevance checks, or an application-controlled speaking gate.
- On 2026-09-12, `npm run typecheck` passed. The web workspace's 34 tests passed. Root `npm run verify` failed because the inherited agent-core and channel test scripts pass quoted `**` globs that Node did not resolve. Live microphone and search behavior were not verified.
- The current shell resolves Node.js `v20.20.2`, while the kit calls for Node.js 22+. Root `.env` has `OPENAI_API_KEY` configured but no `EXA_API_KEY` (presence checked without printing values). The research lane needs a working search credential or an explicitly chosen alternative. Obtain/configure it in parallel with the first feasibility spike; do not place credentials in this file.

## Prototype scope — accepted in principle, time-box corrected to 2.5 hours

One browser room, two humans using one microphone, and one research question. Show a useful sourced finding offered at the right time and a second prepared finding discarded after the topic changes. Keep a visible activity panel with the detected question, research status, evidence, and the reason for offer/hold/discard. A shared microphone does not identify speakers; do not claim speaker recognition. Company-system access, concept previews, extra surfaces, and Intelligence onboarding are outside this 2.5-hour prototype. External writes require an explicit approval path if added later.

Suggested 2.5-hour sequence from the start of focused implementation; adjust to the actual remaining time:

| Elapsed | Deliverable | Exit check |
| --- | --- | --- |
| 0:00–0:15 | Name one integrator and assign non-overlapping files. Smoke-test `/voice` and prove that incremental input is available and automatic speech can be held. | A live signal and a controllable response path are demonstrated; otherwise choose the fallback below immediately. |
| 0:15–0:55 | In parallel: wire speech signals, build a narrow uncertainty detector plus Exa research call, and build the activity panel. | A question starts research while humans continue; the panel shows the source. |
| 0:55–1:35 | Integrate relevance, hold/offer/discard, and short spoken output. | One timely intervention and one stale finding discarded. |
| 1:35–2:00 | Rehearse with two real speakers and fix failures. | Both paths work live; cancellation and error states are honest. |
| 2:00–2:30 | Run typecheck and focused tests; update README and submission notes; record a two-minute demo. | A reproducible run and a recording with visible evidence. |

Fallback at minute 15: if automatic speech cannot be reliably held, deliver findings silently in the panel and let a human explicitly play or invite the short spoken contribution. Keep the asynchronous research and relevance/discard logic live. Do not describe a simulated timing decision as live behavior.

## Suggested parallel ownership

Agree on interfaces before editing shared files. One contributor owns the Realtime connection and speech-control wiring in `apps/web/src/app/voice/page.tsx` and related transport code; that contributor is the only integrator of `page.tsx`. Other agents can own new pure research/decision modules and tests under `apps/web/src/lib/brainstorm/`, and a separate activity-panel component under `apps/web/src/components/`. Assign one owner to any stylesheet and documentation edits. Fix the inherited test scripts only if that work does not contend with a teammate. Use separate branches/worktrees when possible; on a shared checkout, check `git status` and this file before each edit, avoid reverting someone else's work, and coordinate any shared-file changes.

## Active work log

| Owner | Status | Files | Next handoff |
| --- | --- | --- | --- |
| Codex in this chat | Replanned for 2.5 hours; no prototype code started | `TEAM_HANDOFF.md` | Assign integrator and run the 15-minute feasibility spike |
| Other teammate / agents | Unknown | Unknown | Add current work before overlapping edits |

Update this table at the start and end of each work session. Record what changed, what was checked, what failed, and the next safe step. Keep claims about live integrations separate from unit tests and sample data.
