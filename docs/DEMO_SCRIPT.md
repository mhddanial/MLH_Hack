# Demo & Video Script — AOI-Lite Batam

> **Event:** Hacktoberfest Hack Day Kota Batam x Batam Innovation Center
> **Categories:** Best Open-Source AI Project · Best Use of Gemma 4
> **Core Pitch Message:**
> *"In Batam's electronics supply chain, QC inspectors must check PCBs with hundreds of components and thousands of solder joints. Manual inspection is slow, inconsistent, and difficult to document. Full AOI systems help, but they are expensive and still generate false calls. AOI-Lite Batam gives inspectors a low-cost, human-in-the-loop inspection assistant using Gemma 4. It turns a PCB photo into a structured, traceable quality record while keeping the final quality decision with the human inspector."*

---

## Part 1: 90-Second Live Stage Demo Script (3:00 PM Judging)

> **Judge Note:** MLH physical judging prioritizes **showing the working prototype** over slide decks. Have the browser open to `http://localhost:8000` on the **Inspect** tab before stepping up.

### 0:00 – 0:15 | Hook & Problem (15s)
- **Say:** "In Batam's $6.96B electronics sector, Tier-2/Tier-3 PCBA suppliers and SMK labs often inspect boards with magnifiers, Excel, and WhatsApp because industrial AOI machines cost up to $100k—and still generate heavy false calls. We built **AOI-Lite Batam**: an open-source, human-in-the-loop inspection assistant powered by **Gemma 4**."

### 0:15 – 0:45 | Live Gemma 4 Inspection Flow (30s)
- **Action:**
  1. Click a sample PCB from the **Sample Gallery** (e.g., `Short / Solder Bridge` or an SMT defect card). Point out that metadata (`BAT-PCBA-004`, `SMT-L1`, `OP-DEMO-01`) pre-fills and the documentation timer starts.
  2. Click **"Analyze with Gemma 4 (`gemma-4-26b-a4b-it`)"**.
- **Say (while Gemma 4 runs):** "We send the PCB macro image and station metadata from our unified **Next.js Single-Page Application** (deployed on **Vercel**) to open-weight **Gemma 4** via the Gemini API using a versioned prompt (`aoi-prompt-v1.0`). The Next.js API route validates the response against a strict 6-class JSON schema—with automatic retry and offline cache fallback—and stores the audit record in **Supabase PostgreSQL**."
- **Action (when result appears):** Point to the amber **`AI-SUGGESTED`** badge, the **confidence bar**, **location hint**, **visual evidence**, and **routing reason**.

### 0:45 – 1:10 | Human-in-the-Loop Verification & Safety Gate (25s)
- **Say:** "Notice the safety banner: *AI assistance only*. Gemma 4 is never allowed to issue a final pass/fail release, and it explicitly flags that hidden BGA joints require X-ray. As the inspector, I must verify every suggestion."
- **Action:**
  1. Click **Accept** on the primary defect (or **Reject** on a low-confidence flag to show false-call logging).
  2. Select final human disposition: **`rework`**.
  3. Click **"Confirm & Save Quality Record"**.

### 1:10 – 1:30 | Traceable Export, DMAIC Dashboard & Learnings (20s)
- **Action:** Switch to the **Dashboard** tab, then click **Export CSV**.
- **Say:** "Every confirmed record stores both the original AI JSON and the human decision, image SHA-256, model version, and documentation time—feeding a live Lean Six Sigma DMAIC dashboard with Defect Pareto, AI precision, and false-call rate, plus one-click CSV/JSON export."

---

## Part 2: 2-Minute Submission Video Script (MLH Requirement)

> [!IMPORTANT]
> **MLH Video Rule:** Must be <= 2 minutes, public on YouTube/Vimeo/Loom, created during the hackathon, and **must state the full hackathon name at the very beginning**.

| Time | Visual on Screen | Spoken Narration |
|---|---|---|
| **0:00–0:10** | App header + repo side-by-side | *"Hi, I'm [Your Name], and this is my demo for **Hacktoberfest Hack Day Kota Batam x Batam Innovation Center**."* |
| **0:10–0:25** | Inspect tab showing sample gallery & safety banner | *"In Batam's electronics supply chain, QC inspectors check PCBs with thousands of solder joints. Manual logging via Excel and WhatsApp is slow and untraceable, while full AOI systems are expensive and generate false calls. AOI-Lite Batam is an open-source, human-in-the-loop inspection assistant powered by multimodal **Gemma 4**."* |
| **0:25–0:55** | Select sample #1 (Defect board) -> Click Analyze -> Show AI-Suggested card & Raw JSON drawer | *"First, the inspector selects or captures a PCB image and confirms board metadata. We send the image to `gemma-4-26b-a4b-it` with a constrained inspection prompt. Gemma 4 returns structured JSON validated by Pydantic across six visible defect classes—showing location hint, confidence score, severity, visual evidence, and OCR labels."* |
| **0:55–1:25** | Click Accept/Edit/Reject -> Choose Final Disposition (`rework`) -> Save -> Show Records detail modal | *"Crucially, AI never makes an autonomous pass/fail decision. Low-confidence flags automatically route to human verification. Here, the inspector accepts a real short, rejects a false call, and confirms a `rework` disposition. The SQLite audit log preserves both the original Gemma 4 output and the final human decision."* |
| **1:25–1:45** | Switch to Dashboard tab -> Show Pareto, Precision, False-Call Rate -> Click Export CSV & JSON | *"On the Lean Six Sigma DMAIC dashboard, supervisors track inspection count, pending reviews, defect Pareto distribution, AI precision, false-call rate, and documentation time, and export records as CSV or JSON."* |
| **1:45–2:00** | Show GitHub repo (`README.md`, `LICENSE`, `inspection_prompt_v1.txt`) | *"Everything is open-source under the MIT license with offline cached fallback and honest scope limits—assisting inspectors without claiming to replace certified AOI or X-ray. Thanks for watching!"* |

---

## Part 3: Judge Q&A Cheat Sheet

1. **"How is open-source / open-weight AI central to this project?"**
   - Multimodal **Gemma 4 (`gemma-4-26b-a4b-it`)** performs the core visual defect classification, board label OCR, evidence explanation, and structured JSON report generation. Without Gemma 4, the system has no automated inspection intelligence.
2. **"What happens if Gemma 4 hallucinates an invalid defect class or bad JSON?"**
   - `backend/schema.py` enforces a strict 6-class Pydantic `Literal` enum. Any invented class fails validation, triggers an automatic single retry with the exact validation error fed back to Gemma 4, and if still invalid, routes cleanly to manual inspector entry.
3. **"How do you handle false calls?"**
   - Every AI flag has a calibrated confidence score against a `0.60` threshold, requires visual evidence text, and has a one-click **Reject** button. Rejected flags are logged as false calls on the dashboard so engineers can tune prompts and thresholds.
4. **"What did you learn building this?"**
   - Designing multimodal prompts that ground defect claims in visual cues rather than generic electronics priors; combining probabilistic LLM outputs with deterministic safety guardrails; and mapping bare-PCB benchmark data honestly onto an SMT quality workflow.
