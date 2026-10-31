# AOI-Lite Batam: Progress Tracker

> Update this file at the end of every sprint (and whenever a blocker appears).
> Plan: [SPRINT_PLAN.md](SPRINT_PLAN.md) · Done criteria: [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) · Context: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) · Style: [DESIGN.md](DESIGN.md)

**Last updated:** 31 Oct 2026, 12:57 WIB
**Current sprint:** S0 Complete -> Moving to S1 (AI Core + Next.js API Routes + Supabase Migration)
**GitHub Repository:** https://github.com/mhddanial/MLH_Hack.git (`main` branch initialized and pushed, commit `da9e73b`)
**Design System:** IBM Carbon Design System ([`docs/DESIGN.md`](DESIGN.md) — `#ffffff` canvas, `#f4f4f4` surface-1, `#161616` charcoal ink, `#0f62fe` IBM Blue, `0px` square geometry, `IBM Plex Sans` 300/400/600)

---

## 1. Sprint status board

| Sprint | Window | Status | Progress | Notes |
|---|---|---|---|---|
| S0 Setup, Docs & GitHub Init | 11:00–12:55 | 🟢 Complete | ██████████ 100% | Legacy `backend/` removed; Next.js + Carbon Design System initialized; pushed to `https://github.com/mhddanial/MLH_Hack.git` |
| S1 AI Core + Next.js API + Supabase | 12:55–13:30 | 🟡 Next | ██░░░░░░░░ 20% | Apply Supabase table migration, write `src/lib/config.ts`, `schema.ts`, `gemma.ts`, `storage.ts`, and `/api/*` routes |
| S2 Next.js SPA Inspect UI (Carbon) | 13:30–14:00 | ⚪ Queued | ░░░░░░░░░░ 0% | Unified Single-Page Application (`src/app/page.tsx`) styled per `docs/DESIGN.md` |
| S3 Records/Export/Dashboard | 14:00–14:20 | ⚪ Queued | ░░░░░░░░░░ 0% | Supabase-backed records tab, CSV/JSON export, DMAIC dashboard |
| S4 Data + Test + Cache | 14:20–14:40 | ⚪ Queued | ░░░░░░░░░░ 0% | Curate sample images + live Gemma 4 cache generation |
| S5 Harden + Vercel Deploy + Video | 14:40–15:00 | 🟡 Docs Ready | ██████░░░░ 60% | Deploy unified Next.js app to Vercel, verify end-to-end |

---

## 2. Definition of Done scoreboard

| Area | Done / Total | Details |
|---|---|---|
| Project DoD (D1–D10) | 1 / 10 | D9 repo, license, README, prompt, setup instructions pushed to GitHub |
| Submission DoD (H1–H9) | 6 / 9 | H1 (public GitHub repo `mhddanial/MLH_Hack`), H2 (`LICENSE`), H3 (`README`), H4 (`architecture.md`), H5 (AI disclosure), H6 (`DATA_SOURCES.md`) complete |
| Safety/HITL DoD (S1–S11) | 3 / 11 | S1 (utility safety banner in Carbon UI), S9 (X-ray out-of-scope note), S11 (honest scope in docs) complete |
