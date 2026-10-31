# AOI-Lite Batam: Progress Tracker

> Update this file at the end of every sprint (and whenever a blocker appears).
> Plan: [SPRINT_PLAN.md](SPRINT_PLAN.md) · Done criteria: [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) · Context: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) · Style: [DESIGN.md](DESIGN.md)

**Last updated:** 31 Oct 2026, 13:30 WIB
**Current sprint:** Sprint 1, Sprint 2 & Sprint 3 Complete -> Ready for Sprint 4 (Full Sample Evaluation & Offline Cache) & Sprint 5 (Vercel Production Deployment)
**GitHub Repository:** https://github.com/mhddanial/MLH_Hack.git (`main` branch)
**Design System:** IBM Carbon Design System ([`docs/DESIGN.md`](DESIGN.md) — `#ffffff` canvas, `#f4f4f4` surface-1, `#161616` charcoal ink, `#0f62fe` IBM Blue, `0px` square geometry, `IBM Plex Sans` 300/400/600)

---

## 1. Sprint status board

| Sprint | Window | Status | Progress | Notes |
|---|---|---|---|---|
| S0 Setup, Docs & GitHub Init | 11:00–12:55 | 🟢 Complete | ██████████ 100% | Legacy `backend/` removed; Next.js + Carbon Design System initialized; 16 sample boards prepared (`public/samples/` + `labels.json`); pushed to GitHub |
| S1 AI Core + Next.js API + Supabase | 12:55–13:15 | 🟢 Complete | ██████████ 100% | `src/lib/config.ts`, `schema.ts`, `gemma.ts`, `storage.ts`, and all `/api/*` routes built; live `gemma-4-26b-a4b-it` + Supabase PostgreSQL (`public.aoi_inspections`) verified |
| S2 Next.js SPA Inspect UI (Carbon) | 13:15–13:30 | 🟢 Complete | ██████████ 100% | Full 5-step Inspector SPA (`src/app/page.tsx`) styled per `docs/DESIGN.md` with sample gallery, upload, camera, ROI box overlay, per-defect review, and human disposition gate |
| S3 Records/Export/Dashboard | 13:15–13:30 | 🟢 Complete | ██████████ 100% | Quality Records browser + audit drawer, CSV/JSON export (`/api/export/csv`, `/api/export/json`), and Lean Six Sigma DMAIC dashboard built into unified SPA |
| S4 Data + Test + Cache | 13:30–14:20 | 🟡 Next | ████░░░░░░ 40% | 4 samples already cached via live `gemma-4-26b-a4b-it` and stored in Supabase; next: run full 16-sample batch evaluation (`docs/EVALUATION.md`) |
| S5 Harden + Vercel Deploy + Video | 14:20–15:00 | 🟡 Docs Ready | ██████░░░░ 60% | Deploy unified Next.js app to Vercel, record 2-min demo video |

---

## 2. Definition of Done scoreboard

| Area | Done / Total | Details |
|---|---|---|
| Project DoD (D1–D10) | 10 / 10 | D1–D10 implemented and verified with live `gemma-4-26b-a4b-it` and Supabase PostgreSQL (`public.aoi_inspections`) |
| Submission DoD (H1–H9) | 6 / 9 | H1 (public GitHub repo `mhddanial/MLH_Hack`), H2 (`LICENSE`), H3 (`README`), H4 (`architecture.md`), H5 (AI disclosure), H6 (`DATA_SOURCES.md`) complete |
| Safety/HITL DoD (S1–S11) | 11 / 11 | All 11 safety & human-in-the-loop guardrails implemented and verified in `src/lib/gemma.ts`, `src/lib/schema.ts`, and `src/app/page.tsx` |
