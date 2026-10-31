import { z } from "zod";

export const DEFECT_CLASSES = [
  "missing_component",
  "solder_bridge",
  "polarity_error",
  "tombstoning",
  "component_shift",
  "uncertain_or_other",
] as const;

export type DefectClass = (typeof DEFECT_CLASSES)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const IMAGE_QUALITIES = ["acceptable", "poor", "unusable"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export const AI_DISPOSITIONS = [
  "pass",
  "requires_human_verification",
  "rework",
  "quarantine",
  "escalate",
] as const;
export type AIDisposition = (typeof AI_DISPOSITIONS)[number];

export const FINAL_DISPOSITIONS = [
  "pass",
  "rework",
  "quarantine",
  "escalate",
] as const;
export type FinalDisposition = (typeof FINAL_DISPOSITIONS)[number];

export const REVIEW_ACTIONS = [
  "accept",
  "edit",
  "reject",
  "escalate",
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

function normString(val: unknown): unknown {
  if (typeof val === "string") {
    return val.trim().toLowerCase().replace(/[\s-]+/g, "_");
  }
  return val;
}

export const DefectSchema = z.object({
  defect_class: z.preprocess(normString, z.enum(DEFECT_CLASSES)),
  location_hint: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
  severity: z.preprocess(normString, z.enum(SEVERITIES)),
  evidence: z.string().min(1).max(800),
  recommended_action: z.string().min(1).max(400),
});

export type Defect = z.infer<typeof DefectSchema>;

export const InspectionResultSchema = z.object({
  board_id: z.string(),
  inspection_id: z.string(),
  image_quality: z.preprocess(normString, z.enum(IMAGE_QUALITIES)),
  defects: z.array(DefectSchema).max(12).default([]),
  overall_disposition: z.preprocess(normString, z.enum(AI_DISPOSITIONS)),
  visible_labels: z
    .preprocess((val) => {
      if (val == null) return [];
      if (typeof val === "string") return [val];
      if (Array.isArray(val)) return val.map((x) => String(x)).slice(0, 15);
      return [];
    }, z.array(z.string()))
    .default([]),
  notes: z
    .preprocess((val) => (val == null ? "" : String(val)), z.string())
    .default(""),
  model: z.string().default("gemma-4-multimodal"),
  operator_confirmation_required: z.boolean().default(true),
});

export type InspectionResult = z.infer<typeof InspectionResultSchema>;

export const MetadataSchema = z.object({
  board_id: z.string().min(1).max(64),
  board_revision: z.string().max(32).default("A"),
  line_station: z.string().min(1).max(64),
  operator_id: z.string().min(1).max(64),
  inspection_type: z.string().max(64).default("post_reflow"),
});

export type Metadata = z.infer<typeof MetadataSchema>;

export const AnalyzeRequestSchema = z.object({
  metadata: MetadataSchema,
  sample_id: z.string().optional().nullable(),
  image_base64: z.string().optional().nullable(),
  image_name: z.string().optional().nullable(),
  image_sha256: z.string().optional().nullable(),
  precheck: z.record(z.string(), z.unknown()).optional().nullable(),
  started_at: z.string().optional().nullable(),
  force_manual: z.boolean().default(false),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const DefectReviewSchema = z.object({
  ai_index: z.number().int().nullable().optional(),
  action: z.enum(REVIEW_ACTIONS),
  defect_class: z.enum(DEFECT_CLASSES),
  severity: z.enum(SEVERITIES),
  location_hint: z.string().default(""),
  note: z.string().default(""),
});

export type DefectReview = z.infer<typeof DefectReviewSchema>;

export const ReviewRequestSchema = z.object({
  reviewer_id: z.string().min(1).max(64),
  defect_reviews: z.array(DefectReviewSchema).default([]),
  final_disposition: z.enum(FINAL_DISPOSITIONS),
  notes: z.string().default(""),
  doc_time_s: z.number().optional().nullable(),
});

export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

