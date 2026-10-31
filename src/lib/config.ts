import crypto from "crypto";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const PROMPT_PATH = path.join(ROOT, "prompts", "inspection_prompt_v1.txt");

export const PROMPT_VERSION = "aoi-prompt-v1.0";
export const SCHEMA_VERSION = "aoi-schema-v1";
export const APP_VERSION = "0.2.0-carbon-nextjs";

export function getPromptTemplate(): string {
  try {
    return fs.readFileSync(PROMPT_PATH, "utf-8");
  } catch {
    return `You are AOI-Lite Batam, a visual inspection ASSISTANT for SMT PCBs. Return ONLY valid JSON matching aoi-schema-v1.`;
  }
}

export const PROMPT_TEMPLATE = getPromptTemplate();
export const PROMPT_SHA256 = crypto
  .createHash("sha256")
  .update(PROMPT_TEMPLATE, "utf8")
  .digest("hex")
  .slice(0, 12);

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
export const GEMMA_MODEL_ID = process.env.GEMMA_MODEL_ID || "gemma-4-26b-a4b-it";
export const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";

// auto = live Gemma 4 -> fallback to cached sample output -> fallback to manual entry
// live = live only; offline = cached / manual only
export const AI_MODE = (process.env.AI_MODE || "auto").toLowerCase();
export const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_S || "90") * 1000;
export const CONFIDENCE_THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD || "0.60");
export const MAX_IMAGE_SIDE = Number(process.env.MAX_IMAGE_SIDE || "1600");

export const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
export const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
export const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "aoi_inspections";

export const DEMO_OPERATORS = [
  "OP-DEMO-01 (Pak Andi — QC Station 1)",
  "OP-DEMO-02 (Shift B Inspector)",
  "OP-DEMO-03 (Rework Specialist)",
  "SMK-STUDENT-01 (Polibatam / SMK Lab)",
  "SMK-STUDENT-02 (SMK Training Batch B)",
];

export const DEMO_LINES = [
  "SMT-L1 / AOI-Lite-1",
  "SMT-L2 / AOI-Lite-2",
  "Rework & Containment Bench",
  "SMK Electronics Lab Bench A",
];

export const INSPECTION_TYPES = [
  "post_reflow",
  "pre_reflow",
  "rework_verification",
  "incoming_bare_pcb",
  "training",
];

