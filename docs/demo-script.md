# Demo script — Counterpoint (two-minute video)

Shot list for the required two-minute demonstration video. Total run time is
under 120 seconds; each shot's upper bound is noted so a rehearsal can trim
without losing a required beat. Record in Chrome at **`/voice`**, with a real
Google Meet call open in a second tab and a second person talking.

The **discarded-finding beat (shot 5) is required, not optional.** It is the
only beat that shows Counterpoint choosing *not* to interrupt — the evidence
for judging criterion 2 (Innovation & Theme Alignment: restraint is the
feature, not just retrieval).

| # | Time budget | On screen | What it proves |
| --- | --- | --- | --- |
| 1 | 0:00–0:12 (12s) | On `/voice`, set **Audio source** to **Meet tab**, click **Listen to a Meet tab**, pick the open Google Meet browser tab, and check **Share tab audio** in the browser picker. Panel shows **Live source: Meet tab**. | Real tab audio capture via `getDisplayMedia`, not a Chrome extension or microphone. |
| 2 | 0:12–0:32 (20s) | A person in the Meet call asks a concrete question (e.g. "Does browser speech recognition already exist?"). Transcript lines appear; **Detected question** fills in with the pattern-confidence percentage. | Live speech-to-text from the captured tab feeds real uncertainty detection. |
| 3 | 0:32–0:57 (25s) | **Research** field moves `searching` → `synthesizing` → `ready` while the Meet conversation keeps going in the background audio. A **Prepared finding** card appears with source links. | Background research does not block or interrupt the conversation; sources are inspectable, not invented. |
| 4 | 0:57–1:12 (15s) | While someone is still mid-sentence, **Decision** reads `HOLD` with its reason. Once they pause, it flips to `OFFER` and Chrome speaks the finding aloud (**Audio** field confirms playback started/finished). | The participation gate — not a fixed timer — decides when it's safe to speak. |
| 5 | 1:12–1:27 (15s) | A second question is asked, then the conversation moves on before Counterpoint gets a turn (or say "moving on" to trigger a topic change). A **Discarded finding** card appears showing the finding and its discard reason. | **Required beat.** Counterpoint drops stale or off-topic findings instead of dumping them late — visible restraint, the core theme claim. |
| 6 | 1:27–1:47 (20s) | Below the activity panel, click **Draft Slack update** on the Slack draft card. The matched GitHub issue (number, title, linked) and an editable draft textarea appear. | GitHub issue matching turns the conversation into a concrete, checkable artifact. |
| 7 | 1:47–2:00 (13s) | Click **Send to Slack**. Show the honest result: either "Sent to Slack" or the not-configured message if `SLACK_WEBHOOK_URL` is unset in the recording environment. Narrate that nothing sends without this click. | The approval gate on an external write — no silent side effects, and the failure/unconfigured path is shown truthfully rather than hidden. |

Total: 12 + 20 + 25 + 15 + 15 + 20 + 13 = **120s**, so any stumble during
recording should be trimmed from shots 3 or 6 (the least time-critical) rather
than dropped from shots 1, 2, 4, 5, or 7.

## Before recording

- Confirm real `GEMINI_API_KEY` and `EXA_API_KEY` values in root `.env`; set
  `SLACK_WEBHOOK_URL` too if the team wants shot 7 to show a real send instead
  of the honest not-configured state.
- Open the Google Meet tab and start talking in it *before* clicking **Listen
  to a Meet tab** in the Counterpoint tab, so the tab picker has something to
  select.
- Wear headphones on the machine running Counterpoint so its own speech
  playback (shot 4) is not re-captured as new "human" input from the Meet tab.
- Rehearse the discard beat (shot 5) at least once — it depends on timing
  (a topic change or a second, unanswered question) and is the easiest shot to
  lose in a live take.
- Do not narrate or caption this as a Chrome extension, a Google Meet add-on,
  or an OpenAI Realtime session; say "Meet tab audio capture" and "Chrome
  speech recognition and playback."
