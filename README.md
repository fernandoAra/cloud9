# Counterpoint

Counterpoint is a quiet research partner for a live brainstorm. When someone raises a concrete uncertainty such as “Does browser speech recognition already exist?”, it searches public sources while the conversation continues. It prepares a short, sourced contribution, then offers it only after a suitable pause. A new human utterance cancels playback; an outdated finding is discarded.

The problem is timing as much as research. A separate chat interrupts the discussion, while an always-talking assistant can dominate it. Counterpoint makes its research and participation decisions visible in an activity panel, including why a finding is held or discarded.

## What runs today

The MVP runs at **`/voice` in Chrome**. Browser speech recognition supplies interim and final transcript text; [uncertainty detection](apps/web/src/lib/uncertainty.ts) identifies researchable questions; the existing server-side [Exa search route](apps/web/src/app/api/search/route.ts) retrieves sources; [Gemini Flash-Lite](apps/web/src/app/api/counterpoint/route.ts) prepares a brief contribution. A single [participation gate](apps/web/src/lib/participation.ts) uses speech, silence, and staleness signals to decide OFFER, HOLD, or DISCARD. Browser speech synthesis plays an offered finding. The [activity panel](apps/web/src/app/voice/page.tsx) displays the question, research status, finding and sources, and the decision with its reason.

The browser voice surface is the implementation being demonstrated. The [Google Meet Chrome extension design](docs/counterpoint/architecture.md) is a possible next surface; this repository does **not** contain that extension, Meet tab capture, or company-system connectors. The Portuguese [concept document](docs/counterpoint/README-counterpoint-pt.md) records the team's broader product direction.

## Run from a clean clone

Use Node.js 22+ and Chrome. From the repository root:

```bash
git clone https://github.com/F1NH4WK/counterpoint.git
cd counterpoint
npm ci
cp .env.example .env
```

Set these two values in the root `.env`:

```dotenv
GEMINI_API_KEY=your-google-ai-studio-key
EXA_API_KEY=your-exa-key
```

Get a [Gemini API key](https://aistudio.google.com/apikey) and an [Exa API key](https://dashboard.exa.ai/api-keys). The keys are read by server routes and must stay out of the browser and version control. **No OpenAI API credits or key are required for Counterpoint's `/voice` flow.** The inherited starter-kit chat and Realtime endpoints have separate credentials and are not used by this flow.

Start the single web process:

```bash
npm run dev:web
```

Open **http://127.0.0.1:3100/voice** in Chrome. Select English or Português (Brasil), click **Start talking**, and allow microphone access. In Chrome's microphone site settings, select the microphone you intend to use; virtual audio devices can appear as the default. Try “Does browser speech recognition already exist?” in English, or “Será que isso já existe?” in Portuguese. Watch the **Detected question**, **Research**, and **Decision** fields. When a finding is offered, Chrome speaks it and the panel shows its source links. Headphones help keep playback out of the microphone.

Chrome speech recognition and playback must be available and microphone access granted. Exa and Gemini availability affect live research; if Gemini fails, the page can use a short Exa excerpt. Findings and transcript are session-only browser state.

## Verify

```bash
npm run typecheck
npm test --workspace web
```

These checks cover the detector and gate; they do not substitute for a live microphone, Exa, Gemini, and playback rehearsal. The inherited root `npm run verify` currently has an unrelated test-glob issue.

The repository began with the [Agents, Everywhere starter kit](https://github.com/CopilotKit/agents-everywhere-starter-kit). Its CopilotKit incident web app at `/`, Slack sample, and mobile sample are included as reference code, not Counterpoint features. See [SUBMISSION.md](SUBMISSION.md) for the inherited-versus-built breakdown and current verification limits.
