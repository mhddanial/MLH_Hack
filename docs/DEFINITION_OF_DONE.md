# AOI-Lite Batam: Definition of Done

> The project is **done** when every 🔴 item in Section 1 is checked and verified in the running app (not just written in code).
> Verification = actually performed and observed by a team member. Record the evidence in [PROGRESS.md](PROGRESS.md).

## 1. Project-level Definition of Done (from the brief)

| # | Criterion | How to verify | Status |
|---|---|---|---|
| D1 | 🔴 A user can **select or capture** a PCB image | Pick a gallery image; upload a file; camera or `<input capture>` on a phone | [ ] |
| D2 | 🔴 The app **sends it to Gemma 4** | Network log / server log shows a `generateContent` call to the `gemma-4-*` model; record has `ai_source=live` | [ ] |
| D3 | 🔴 Gemma 4 returns **valid structured JSON** | Strict schema validation passes in Next.js API route; raw JSON visible in the SPA UI; JSON-valid rate in EVALUATION.md | [ ] |
| D4 | 🔴 The UI shows the **AI-suggested** result | Card shows the `AI-SUGGESTED` chip, class, location, confidence, severity, evidence, action | [ ] |
| D5 | 🔴 Inspector can **confirm, edit, reject, or escalate** | Each of the 4 actions exercised at least once and stored per defect | [ ] |
| D6 | 🔴 The **final record is saved** | Row in Supabase PostgreSQL (`public.aoi_inspections`) + local fallback with original AI output + human decision + agreement + audit fields | [ ] |
| D7 | 🔴 Record **exports as CSV and JSON** | Both downloads open correctly (CSV in Excel/Sheets) | [ ] |
| D8 | 🔴 **Dashboard** shows basic stats | Inspection count, defect distribution, pending reviews match the records | [ ] |
| D9 | 🔴 Repo contains **source, license, README, sample data, prompt, setup instructions** | Fresh clone + README steps → app runs | [ ] |
| D10 | 🔴 **Live demo runs on preloaded images** without a factory environment | Works with Wi-Fi off (`AI_MODE=offline` or auto fallback using cached Gemma output) | [ ] |

## 2. Hackathon submission Definition of Done

| # | Criterion | Status |
|---|---|---|
| H1 | 🔴 GitHub repo is **public** and stays public (`https://github.com/mhddanial/MLH_Hack.git`) | [x] |
| H2 | 🔴 **MIT** `LICENSE` file at the repo root | [x] |
| H3 | 🔴 README names the open-weight model (**Gemma 4**, model ID `gemma-4-26b-a4b-it`), prompt version, dependencies | [x] |
| H4 | 🔴 README has an **architecture diagram** | [x] |
| H5 | 🔴 **AI tools disclosure** (coding assistants used) in the README and submission | [x] |
| H6 | 🔴 Data-source statement: no confidential or production data, no real PII (`sample_data/DATA_SOURCES.md`) | [x] |
| H7 | 🔴 Demo video ≤2 min, public, opens with the hackathon name | [ ] |
| H8 | 🔴 OrganizerHQ submission for **Best Open-Source AI Project** (+ Best Use of Gemma 4) | [ ] |
| H9 | 🔴 All code written during the event; last feature commit before 15:00 | [ ] |

## 3. Safety and human-in-the-loop Definition of Done (non-negotiable)

| # | Rule | Verified by | Status |
|---|---|---|---|
| S1 | 🔴 Banner "AI assistance only. Final quality disposition requires human verification." visible on every screen | Visual check | [ ] |
| S2 | 🔴 AI output is labelled **AI-suggested** until confirmed | Visual check | [ ] |
| S3 | 🔴 The AI can never set a final disposition. The final value comes only from the human review endpoint | Code review + API test (analyze never writes `final_disposition`) | [ ] |
| S4 | 🔴 `operator_confirmation_required` is always `true` in stored output | DB check | [ ] |
| S5 | 🔴 Confidence below the threshold is auto-routed to `requires_human_verification` with a visible reason | Test with a low-confidence result | [ ] |
| S6 | 🔴 Only the 6 classes are accepted from the AI and in edit dropdowns | Forced invalid-class test → retry/manual | [ ] |
| S7 | 🔴 Invalid JSON → retry once → manual entry | Forced bad-output test | [ ] |
| S8 | 🔴 Original AI output and human decision are stored separately, with an agree/partial/disagree flag | DB / JSON export check | [ ] |
| S9 | 🔴 Hidden defects (BGA voids, HiP) stated as out of scope, X-ray required | Prompt + README + UI note | [ ] |
| S10 | 🔴 Each record stores model ID, prompt version + SHA, image SHA-256/filename, timestamp, human decision | DB check (traceability 100%) | [ ] |
| S11 | 🔴 No accuracy claims beyond the measured demo numbers | README review | [ ] |

## 4. Sprint-level Definition of Done

| Sprint | Done when… |
|---|---|
| **S0 Setup** | Docs written · repo public with LICENSE, .gitignore, .env.example · venv installs · prompt + schema committed · ≥16 sample images with `labels.json` + `DATA_SOURCES.md` |
| **S1 AI Core** | Live Gemma 4 call returns validated JSON for a sample · retry/manual path proven with forced bad output · pending row in SQLite · all API routes respond |
| **S2 Inspect UI** | Browser flow sample → analyze → review (4 actions) → confirm works in ≤5 interactions · manual-entry path works · banner + chips present |
| **S3 Data views** | Records list + detail · CSV (one row per defect) + JSON export correct · dashboard KPIs (count, pending, distribution, precision, false-call rate, traceability) match the data |
| **S4 Test** | 16+ images run live · cache files exist for all samples · offline mode demoed with Wi-Fi off · `EVALUATION.md` with real numbers · ≥10 human-reviewed records |
| **S5 Ship** | README complete · architecture + demo script · backup video recorded and public · submission sent · stop at 15:00 |

## 5. Feature-level acceptance criteria

### F1 Image input
- Gallery loads ≥16 thumbnails offline. Clicking one selects it and pre-fills the board ID.
- Upload accepts JPG/PNG up to 15 MB. Images larger than 1600 px are resized server-side.
- Camera: preview + capture on desktop/localhost. On failure, the file-input `capture` fallback is offered automatically.

### F2 Metadata
- Board ID, line/station, and operator are required. Analyze stays disabled until they're filled.
- Operators are pseudonymous demo IDs only.

### F3 Gemma 4 inference
- Prompt version and model ID are shown in the UI and stored per record.
- Typical latency is 10–20 s. A spinner shows elapsed time. Timeout is 90 s, then the error path runs.

### F4 Validation and fallback
- Extracts JSON even when it's wrapped in code fences.
- Strict enum validation. One retry with the error message. Then manual entry with the reason shown.
- API/network failure → cached real output (sample images) → manual entry.

### F5 Review and confirm
- Every AI defect requires an action. Edit allows only the 6 classes.
- A human can add missed defects.
- The final disposition can only be pass / rework / quarantine / escalate. It is never pre-selected from the AI.
- Saved record shows a `HUMAN-CONFIRMED` (or `ESCALATED`) chip and the documentation time.

### F6 Storage and export
- SQLite persists across restarts.
- CSV opens in Excel with headers. JSON includes `ai_result`, `human_review`, `audit`.

### F7 Dashboard
- Numbers recompute from the DB on each load.
- Shows: total, pending, confirmed, escalated, defect Pareto, precision, false-call rate, recall proxy, agreement %, traceability %, average doc time.

## 6. Quality bar (hackathon-appropriate)
- No crash on any demo path. Errors show a readable message with a next action.
- Works in current Chrome/Edge on a laptop and in an Android/iOS browser (layout).
- No secrets in git (`.env` ignored; key only in the local `.env`).
- Code is readable and commented where the safety logic lives (`gemma_client.apply_safety_rules`). Production polish isn't required.
