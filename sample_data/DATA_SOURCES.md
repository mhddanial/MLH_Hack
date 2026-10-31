# Data Sources, Attribution, and Taxonomy Mapping

> **Privacy & IP Compliance Statement:**
> AOI-Lite Batam uses **only** publicly available open-source academic/Kaggle research datasets and synthetic/procedural test cards. **Zero** confidential customer PCBs, proprietary designs, unreleased product layouts, or real production/operator personal data (PII) are stored or transmitted.

---

## 1. Primary Sample Dataset: PKU / Kaggle PCB Defects Dataset

- **Dataset Title:** PCB Defects
- **Source URL:** https://www.kaggle.com/datasets/akhatova/pcb-defects?resource=download-directory
- **Original Origin:** Open Lab on Human Robot Interaction, Peking University (PKU) — *A PCB Dataset for Defects Detection and Classification* (Weibo Huang, Peng Wei).
- **Local Workspace Path:** `dataset/PCB_DATASET` (693 annotated bare-PCB defect images across 6 folders + 10 clean template boards in `PCB_USED/`).
- **License & Usage:** Public academic/benchmark dataset published on Kaggle and PKU Open Lab for PCB defect detection research and benchmarking. Only a lightweight resized subset (16 sample images, `<=1600px`) is bundled in `sample_data/images/` for offline hackathon demonstration.

---

## 2. Taxonomy Mapping & Honest Engineering Disclosure

### Bare-PCB vs. SMT PCBA Scope Note
The Kaggle `akhatova/pcb-defects` dataset consists of high-resolution macro photographs of **bare printed circuit boards** (copper traces, pads, and drill holes prior to component placement/reflow) containing six fabrication anomaly categories:
1. `Missing_hole`
2. `Mouse_bite`
3. `Open_circuit`
4. `Short`
5. `Spur`
6. `Spurious_copper`

Our target MVP taxonomy is designed for **SMT / PCBA inspection** with strictly **six allowed defect classes**:
1. `missing_component`
2. `solder_bridge`
3. `polarity_error`
4. `tombstoning`
5. `component_shift`
6. `uncertain_or_other`

### How Sample Images Map to the 6 Allowed Classes

| Source Image Category | Mapped AOI-Lite Batam Class | Rationale | Expected Disposition Suggestion |
|---|---|---|---|
| **PKU `Short`** (`images/Short/*`) | `solder_bridge` | Unintended conductive bridge connecting two adjacent copper traces/pads (direct electrical short analogue). | `rework` or `requires_human_verification` |
| **PKU `Missing_hole`** (`images/Missing_hole/*`) | `uncertain_or_other` | Bare-board drill anomaly; visible defect requiring human verification / process engineering escalation. | `requires_human_verification` or `escalate` |
| **PKU `Mouse_bite`** (`images/Mouse_bite/*`) | `uncertain_or_other` | Trace notch/erosion anomaly outside the 5 assembly-specific classes. | `requires_human_verification` |
| **PKU `Open_circuit`** (`images/Open_circuit/*`) | `uncertain_or_other` | Broken copper trace (open circuit anomaly routed under `uncertain_or_other` with `high` severity). | `rework` or `escalate` |
| **PKU `Spur`** (`images/Spur/*`) | `uncertain_or_other` | Sharp copper protrusion hazard near adjacent conductor. | `requires_human_verification` |
| **PKU `Spurious_copper`** (`images/Spurious_copper/*`) | `uncertain_or_other` | Excess copper residue island on substrate. | `requires_human_verification` |
| **PKU `PCB_USED`** (`PCB_USED/01..12.JPG`) | *(None — Golden Sample)* | Clean reference boards without annotated defects. Used to test false-call rate and `pass` candidate suggestions. | `pass` (still requires human confirmation) |
| **Procedural SMT Demo Cards** (`scripts/prepare_samples.py`) | `missing_component`, `polarity_error`, `tombstoning`, `component_shift` | Cleanly labelled procedural SMT macro reference cards generated via Pillow so judges can also exercise the remaining 4 assembly defect classes during live demos. | `rework` / `quarantine` |

---

## 3. Out-of-Scope Defects (Requires X-Ray / SPI)
As documented in the Project Brief (Section 6.1), **optical inspection cannot see hidden solder joints**. AOI-Lite Batam explicitly excludes:
- **BGA / QFN / LGA hidden solder voids**
- **Head-in-Pillow (HiP) defects**
- **Internal crack or under-package bridging**

All such boards require dedicated **X-ray inspection** and **functional testing**.

---

## 4. Operator & Factory Metadata Anonymization
All operator IDs (`OP-DEMO-01`, `SMK-STUDENT-01`, etc.), board IDs (`BAT-PCBA-001`, etc.), and station names (`SMT-L1 / AOI-Lite-1`, `SMK Lab Bench A`) are fictional demo identifiers.
