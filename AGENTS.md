# Notes for coding agents

## This team's project — read this first

**cloud9.** An agent that sits inside a live conversation between two humans and
only speaks when it has something worth saying, in a real turn-taking gap. It
never talks over anyone. If the moment passes, the interjection is discarded
rather than queued.

- **User:** two people in a working conversation — a pairing session, a customer
  call, a planning discussion.
- **Surface:** the browser `/voice` route in `apps/web`, two speakers, one mic.
- **Why the surface matters:** the value is timing. A chatbox has no turns to
  take, so this interaction cannot exist there.

### What already exists — do not rebuild it

`apps/web/src/app/voice/page.tsx` runs a working OpenAI Realtime session over
WebRTC, with an ephemeral secret from `apps/web/src/app/api/realtime-token/route.ts`
and an Exa-backed `search_web` tool hitting `/api/search`. Read all three before
planning. The Realtime API already handles mic capture, server-side VAD, and
interruption. None of that is being replaced.

### What is net-new, and is the entire project

Server VAD answers "is someone talking?". It cannot answer "is this a gap where a
third party would be welcome to speak?" That judgment is what we are building: a
**turn-taking gate** between the conversation and the agent's voice output.

- Track speech and silence on the incoming mic stream locally, in the browser,
  independently of the server's VAD.
- Classify silences. A short pause inside one person's turn is not an opening; a
  longer gap after a completed thought is. Thresholds are named constants with
  stated defaults, tunable live during the demo.
- The agent may speak only inside an opening. If it wants to speak and no opening
  arrives within a bounded window, the interjection is **discarded**. Stale
  commentary is worse than silence.
- If a human starts speaking while the agent is talking, cancel the in-flight
  response immediately. Do not let it finish its sentence.
- Render the state on screen: listening / holding / speaking, the reason the last
  interjection was allowed or suppressed, and the measured latency from
  gap-detected to first audio out. This panel is the evidence a judge sees and
  the thing we film. It is not decoration.

Design the gate as a plain module with pure logic — inputs are speech/silence
events plus timestamps, outputs are allow/suppress decisions — unit testable with
synthetic event sequences and no browser. Keep the React wiring in a thin
component around it, with tests alongside using the repo's existing setup.

### Scope discipline

Seven-hour build, already past the halfway mark. Ship the single interaction
above before anything else. Do not add auth, a database, extra sponsor
integrations, a settings page, or a second surface. Do not scaffold a new app, do
not run an onboarding wizard, do not provision templates we are not using.
Preserve the existing app, model provider, tools and approval behavior. If
something seems necessary that is not listed here, stop and ask.

### Verification

`npm run verify` (typecheck + tests) before claiming anything works, and again
after every change. Never state that something passes without having run it in
this session. `/voice` must still connect and hold a live conversation after your
changes; if you cannot verify that yourself, say so rather than assuming.

### Submission

When the interaction works end to end, fill in `SUBMISSION.md`. Under "What we
inherited": this starter kit and its voice route, plus the pre-existing
`rt-voice-kit` library if we import it. Under "What we built during the
hackathon": the turn-taking gate, pointing at its files. Be accurate; do not
overclaim.

---


Read [hackathon-overview.md](hackathon-overview.md), [hackathon-rules.md](hackathon-rules.md), and [using-sponsor-tools.md](using-sponsor-tools.md), then the chosen app README in `apps/channel`, `apps/web`, or `apps/mobile`. Build the team's own workflow; the incident app is infrastructure reference code.

CopilotKit powers the Slack and web templates. The mobile starting point in `apps/mobile` has its own install and environment; follow its README for setup and checks.

For setup, follow [CopilotKit onboarding](README.md#copilotkit-onboarding) after choosing an app. For Slack, run `npm run channel:setup -- --no-clipboard` and continue with the emitted prompt and installed `channels-setup` skill. For web/mobile, explain the model-only and Intelligence options before starting the official `onboard start` workflow. Preserve the chosen app and its working behavior; do not scaffold over this checkout or provision every template. Use current CLI instructions instead of copying authentication and provisioning steps from memory.

Read `.agents/skills/build-channels-agent/SKILL.md` before touching anything in
`apps/channel/`. It carries the verified API surface; the most common
failure mode in this codebase is inventing a plausible-looking Channels API.

Hard-won rules that are easy to get wrong here:

- **`@ag-ui/client` must stay deduped.** The root `package.json` pins it via
  `overrides` to the exact version `@copilotkit/runtime` declares. Two copies
  produce two `AbstractAgent` types and every `createChannel({ agent })` fails
  on a private `_debug` property. If you bump `@copilotkit/runtime`, re-check
  `npm ls @ag-ui/client` and update the override.
- **`@copilotkit/channels` and `@copilotkit/runtime` are a tested pair.** Bump
  together, keep them exact.
- **Files containing JSX must be `.tsx`**, and the tsconfig must set
  `jsxImportSource: "@copilotkit/channels"`. This is not React.
- **`maxSteps` defaults to 1** on `BuiltInAgent`. Any agent with tools needs more,
  or it calls one tool and stops before seeing the result.
- **Do not add `identifyUser` to `CopilotRuntime`.** It belongs on
  `createChannel`, and must be absent on a Channels-only runtime.
- **Handlers return `void`.** `thread.post()` returns a `MessageRef`, so a
  concise arrow body fails under `strict`. Use a block body and `await`.
- **Never invent a component or prop.** The vocabulary is fixed — see
  `references/ui-components.md` in the skill.
- Run `npm run typecheck` before claiming anything works.
