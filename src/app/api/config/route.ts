import { NextResponse } from "next/server";
import {
  AI_MODE,
  APP_VERSION,
  CONFIDENCE_THRESHOLD,
  DEMO_LINES,
  DEMO_OPERATORS,
  GEMINI_API_KEY,
  GEMMA_MODEL_ID,
  INSPECTION_TYPES,
  MAX_IMAGE_SIDE,
  PROMPT_SHA256,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  SUPABASE_KEY,
  SUPABASE_TABLE,
  SUPABASE_URL,
} from "@/lib/config";
import {
  AI_DISPOSITIONS,
  DEFECT_CLASSES,
  FINAL_DISPOSITIONS,
  REVIEW_ACTIONS,
  SEVERITIES,
} from "@/lib/schema";

export async function GET() {
  return NextResponse.json({
    app_version: APP_VERSION,
    model_id: GEMMA_MODEL_ID,
    prompt_version: PROMPT_VERSION,
    prompt_sha256: PROMPT_SHA256,
    schema_version: SCHEMA_VERSION,
    confidence_threshold: CONFIDENCE_THRESHOLD,
    max_image_side: MAX_IMAGE_SIDE,
    ai_mode: AI_MODE,
    gemini_key_configured: Boolean(GEMINI_API_KEY),
    supabase_configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    supabase_table: SUPABASE_TABLE,
    defect_classes: DEFECT_CLASSES,
    severities: SEVERITIES,
    ai_dispositions: AI_DISPOSITIONS,
    final_dispositions: FINAL_DISPOSITIONS,
    review_actions: REVIEW_ACTIONS,
    demo_operators: DEMO_OPERATORS,
    demo_lines: DEMO_LINES,
    inspection_types: INSPECTION_TYPES,
  });
}

