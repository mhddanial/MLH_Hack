# AOI-Lite Batam: Progress Tracker

> Update this file at the end of every sprint (and whenever a blocker appears).
> Plan: [SPRINT_PLAN.md](SPRINT_PLAN.md) · Done criteria: [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) · Context: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)

**Last updated:** 31 Oct 2026, 12:08 WIB
**Current sprint:** S0 — Alignment and setup (Updated to **Unified Next.js Full-Stack SPA on Vercel + Supabase PostgreSQL**)
**Overall status:** 🟢 `.docx` brief & all markdown docs updated to the unified Next.js (Frontend + API Routes on Vercel) + Supabase stack. Ready to apply Supabase migration and build the Next.js application.
**Time remaining until code freeze (14:30):** ~2 h 22 m · **until hard stop (15:00):** ~2 h 52 m

---

## 1. Sprint status board

| Sprint | Window | Status | Progress | Notes |
|---|---|---|---|---|
| S0 Setup & Docs | 11:00–12:08 | 🟢 Complete | ██████████ 100% | `.docx` brief + all docs updated for unified Next.js SPA + API routes on Vercel + Supabase |
| S1 AI Core + Next.js API + Supabase | 12:08–12:45 | ⚪ Next | ██░░░░░░░░ 20% | Apply Supabase table migration, write `src/lib/config.ts`, `schema.ts`, `gemma.ts`, `storage.ts`, and `/api/*` routes |
| S2 Next.js SPA Inspect UI | 12:45–13:30 | ⚪ Queued | ░░░░░░░░░░ 0% | Unified Single-Page Application (`src/app/page.tsx`) with 5-step workflow |
| S3 Records/Export/Dashboard | 13:30–14:10 | ⚪ Queued | ░░░░░░░░░░ 0% | Supabase-backed records tab, CSV/JSON export, DMAIC dashboard |
| S4 Data + Test + Cache | 14:10–14:35 | ⚪ Queued | ░░░░░░░░░░ 0% | Curate sample images + live Gemma 4 cache generation |
| S5 Harden + Vercel Deploy + Video | 14:35–15:00 | 🟡 Docs Ready | ██████░░░░ 60% | Deploy unified Next.js app to Vercel, verify end-to-end |

---

## 2. Decisions log (Updated for Unified Next.js SPA on Vercel + Supabase)

| # | Decision | Rationale |
|---|---|---|
| DEC-01 | **Unified Next.js Full-Stack SPA (React + TypeScript + Tailwind CSS + App Router `/api/*`)** | Replaces separate FastAPI/Railway backend due to Railway server error; zero CORS issues, single `npm run dev`, and one-click deploy to **Vercel** |
| DEC-02 | **Gemma 4 (`gemma-4-26b-a4b-it`)** via Gemini API **REST** (`fetch`) | Open-weight multimodal model; full control over retries & strict schema validation in Next.js Route Handlers |
| DEC-03 | **Supabase PostgreSQL (`public.aoi_inspections`)** + local JSON fallback | Cloud database persistence across stations/deployments while preserving 100% offline demo safety |
| DEC-04 | **Client-side Canvas image normalization (`<=1600px` JPEG + SHA-256)** | Keeps request payloads small (<500 KB) so Vercel serverless function body limits (4.5 MB) are never exceeded |
| DEC-05 | Confidence threshold default **0.60**, configurable | Routes uncertain calls to humans; tunable in the Control phase |
| DEC-06 | Offline fallback replays **real** cached Gemma 4 outputs, badged "CACHED" | Honest offline demo; nothing fabricated |
| DEC-07 | Strict validation: classes outside the 6 values **fail** (no silent remap) | "Do not invent defect classes" rule |
| DEC-08 | CSV = one row per defect | Pareto/Analyze-ready in Excel |
| DEC-09 | MIT license | Simple, OSI-approved |
| DEC-10 | PKU mapping: `short → solder_bridge`, others → `uncertain_or_other`, `PCB_USED` → golden/pass | Best honest fit of `akhatova/pcb-defects` to the SMT taxonomy |
