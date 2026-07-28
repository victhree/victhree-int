# VicThree SSB Personal Interview Trainer

A personal-use web app that simulates the full SSB Personal Interview end to end:
the candidate takes the psychology tests, fills the PIQ, gets a consolidated
Perception Report, and then faces a dynamic, time-bound personal interview where an
Interviewing Officer asks questions one at a time, adapting to the answers, the PIQ
and the psychological profile. It tests **consistency** (do the answers match the PIQ
and the perception report?) and **Officer-Like Qualities (OLQs)**.

Static HTML/CSS/JS, no build step. Deploys on GitHub Pages. All AI runs through a
Cloudflare Worker that holds the Gemini key as a secret. The word "AI" never appears
in the candidate-facing UI — it is the "Interviewing Officer", the "Perception Report"
and the "Interview Analysis".

## The journey

`Tests → Report → PIQ → Interview → Assessment`

1. **Login** — enter a name to create a local profile. All data is saved in
   `localStorage` on the device, keyed by profile (no backend).
2. **Psychology Tests** — the full battery (PPDT, TAT, WAT, SRT, SDT) using the reused
   trainer engine. Each test's structured analysis is saved to the profile.
3. **Perception Report** — merges every test analysis into one personality/OLQ report.
4. **PIQ Form** — the structured Personal Information Questionnaire, saved as JSON.
5. **Personal Interview** — a time-bound, one-question-at-a-time adaptive interview
   (~25 questions, 75s each, ~30 min). The transcript is saved after every turn, so a
   refresh resumes.
6. **Interview Analysis** — grades the whole transcript (OLQs, consistency vs PIQ and
   perception report, question-by-question notes) with a downloadable PDF.

Defaults are set in `assets/config.js` (`interview.maxQuestions`, `secondsPerQuestion`).

## Setup

### 1. Deploy the Worker
1. Get a free Gemini API key from Google AI Studio.
2. At dash.cloudflare.com, create a Worker and paste `worker/worker.js` from this repo.
   (You can reuse the **same** Worker as the main `victhree-ssb` site — this file is a
   superset that keeps all the psychology modes and adds `REPORT` and `IV`.)
3. Add a Secret named `GEMINI_API_KEY` = your key.
4. Both `victhree.github.io` sites share one origin, so `ALLOWED_ORIGINS` already covers
   this repo. If you use a custom domain, add it there.

### 2. Point the site at the Worker
Put the Worker URL in `assets/config.js` → `aiEndpoint`.

### 3. Deploy to GitHub Pages
Push this repo to `victhree/victhree-ssb-interview` (or any name) and enable Pages on the
default branch. The site will be at `https://victhree.github.io/<repo>/`.

> If you rename the repo, the Pages origin is still `https://victhree.github.io`, so the
> Worker CORS needs no change.

### Cache-busting
CSS/JS are loaded with `?v=1`. Bump the number when you change a shared asset so GitHub
Pages serves the new version.

## Storage layer

`assets/store.js` (`window.V3Store`) is the **only** module that touches storage.
To move to Firebase / Supabase later, re-implement the same surface
(`createProfile`, `data`, `save`, and the get/set helpers) against the backend —
nothing else in the app calls `localStorage`.

## File map

```
index.html              login + journey dashboard
tests/index.html        battery hub
tests/{ppdt,tat,wat,srt,sdt}.html  the five psychology tests (reused engine)
perception/index.html   consolidated Perception Report (worker: REPORT)
piq/index.html          PIQ form
interview/index.html    dynamic timed interview (worker: IV plan/next)
report/index.html       final Interview Analysis + PDF (worker: IV assess)
assets/
  styles.css            shared theme (copied from victhree-ssb)
  iv.css                journey-specific styles
  trainer.js            psychology test engine (copied; + onAnalysis hook)
  store.js              storage layer (profiles + all journey data)
  journey.js            progress tracker + profile guard
  config.js             worker URL + interview defaults
  banner.png, shield-*.png, vendor/jspdf.umd.min.js
data/
  wat-practice.js, srt-practice.js, tat-pictures.js, ppdt-pictures.js
worker/worker.js        Gemini worker: psychology modes + REPORT + IV
```

## Worker contract

- Psychology: `mode: WAT|SRT|SDT|TAT|PPDT|GPE` → `{ summary, olqs_reflected, olqs_to_work_on, items }`
- `mode:"REPORT"` `{ analyses:[{test,data}] }` → `{ summary, olqs_strong, olqs_to_work_on, probe_areas, temperament }`
- `mode:"IV", action:"plan"` `{ piq, report }` → `{ focus_areas, piq_hotspots, notes }`
- `mode:"IV", action:"next"` `{ piq, report, plan, history, askedCount, maxQuestions }` → `{ done:false, question, targets }` or `{ done:true }`
- `mode:"IV", action:"assess"` `{ piq, report, history }` → `{ summary, olqs_reflected, olqs_to_work_on, consistency, items }`

There are no official correct answers anywhere in the app; every report is framed as
guidance, not a verdict.
