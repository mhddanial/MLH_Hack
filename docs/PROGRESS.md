# AOI-Lite Batam: Progress Tracker

> Update this file at the end of every sprint (and whenever a blocker appears).
> Plan: [SPRINT_PLAN.md](SPRINT_PLAN.md) · Done criteria: [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) · Context: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) · Style: [DESIGN.md](DESIGN.md)

**Last updated:** 31 Oct 2026, 13:55 WIB
**Current sprint:** All Engineering Sprints (S0–S4 & S5 Code/Docs) Complete -> Ready for Live Demo / Vercel Deployment
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
| S4 Data + Test + Cache | 13:30–13:55 | 🟢 Complete | ██████████ 100% | 16/16 sample responses cached (`sample_data/cached_responses/`); 15 records seeded in Supabase `public.aoi_inspections` + `sample_data/seed_records.json`; `docs/EVALUATION.md` populated with prompt-tuning story |
| S5 Harden + Docs + Push | 13:55–15:00 | 🟢 Code & Docs Complete | █████████░ 90% | All code, caches, evaluation docs, and demo scripts committed and pushed to `https://github.com/mhddanial/MLH_Hack.git`; ready for user's Vercel import & 2-min demo video |

---

## 2. Definition of Done scoreboard

| Area | Done / Total | Details |
|---|---|---|
| Project DoD (D1–D10) | 10 / 10 | All 10 MVP requirements verified end-to-end with live `gemma-4-26b-a4b-it`, 16 offline sample caches, and Supabase PostgreSQL (`public.aoi_inspections`, 15 rows) |
| Submission DoD (H1–H9) | 7 / 9 | H1–H6 and H9 complete in public repo (`https://github.com/mhddanial/MLH_Hack.git`); only user's 2-min demo video recording (H7) and OrganizerHQ form submission (H8) remain |
| Safety/HITL DoD (S1–S11) | 11 / 11 | All 11 safety & human-in-the-loop guardrails implemented and verified |
