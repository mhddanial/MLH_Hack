import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { AI_MODE, GEMMA_MODEL_ID, PROMPT_SHA256, PROMPT_VERSION } from "@/lib/config";
import {
  AIOutcome,
  analyzeCachedSample,
  analyzeLiveWithGemma,
  applySafetyRules,
  GemmaUnavailableError,
  saveSampleCache,
} from "@/lib/gemma";
import { AnalyzeRequestSchema } from "@/lib/schema";
import {
  computeShift,
  generateInspectionId,
  InspectionRecord,
  insertInspectionRecord,
} from "@/lib/storage";

function loadSampleInfo(sampleId: string): {
  imagePath: string;
  referenceLabel: string | null;
} | null {
  const labelsPath = path.join(process.cwd(), "sample_data", "labels.json");
  const imgPath = path.join(process.cwd(), "public", "samples", `${sampleId}.jpg`);
  if (!fs.existsSync(imgPath)) return null;

  let referenceLabel: string | null = null;
  if (fs.existsSync(labelsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(labelsPath, "utf-8")) as {
        samples?: Array<{ id: string; expected_defect_class?: string }>;
      };
      const found = (data.samples || []).find((s) => s.id === sampleId);
      if (found?.expected_defect_class) {
        referenceLabel = found.expected_defect_class;
      }
    } catch {
      // ignore
    }
  }
  return { imagePath: imgPath, referenceLabel };
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid analyze request payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const req = parsed.data;
  const meta = req.metadata;
  const now = new Date();
  const inspectionId = generateInspectionId(now);
  const shift = computeShift(now);

  let imageBase64Raw = "";
  let mimeType = "image/jpeg";
  let imageFilename = req.image_name || "uploaded_pcb.jpg";
  let imageSha256 = req.image_sha256 || "";
  let referenceLabel: string | null = null;

  if (req.sample_id) {
    const sampleInfo = loadSampleInfo(req.sample_id);
    if (!sampleInfo) {
      return NextResponse.json(
        { error: `Sample image '${req.sample_id}' not found on server` },
        { status: 404 }
      );
    }
    const buf = fs.readFileSync(sampleInfo.imagePath);
    imageBase64Raw = buf.toString("base64");
    imageSha256 = crypto.createHash("sha256").update(buf).digest("hex");
    imageFilename = `/samples/${req.sample_id}.jpg`;
    referenceLabel = sampleInfo.referenceLabel;
  } else if (req.image_base64) {
    const dataUrlMatch = req.image_base64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      imageBase64Raw = dataUrlMatch[2];
    } else {
      imageBase64Raw = req.image_base64;
    }
    if (!imageSha256) {
      const buf = Buffer.from(imageBase64Raw, "base64");
      imageSha256 = crypto.createHash("sha256").update(buf).digest("hex");
    }
  } else {
    return NextResponse.json(
      { error: "Either sample_id or image_base64 is required" },
      { status: 400 }
    );
  }

  let outcome: AIOutcome;

  if (req.force_manual) {
    outcome = {
      status: "manual_required",
      source: "manual",
      result: null,
      raw_text: "",
      attempts: 0,
      latency_ms: 0,
      errors: ["Operator selected direct manual entry mode"],
      routing_reasons: ["Direct manual entry requested by operator"],
      original_ai_disposition: null,
      model_id: GEMMA_MODEL_ID,
    };
  } else if (AI_MODE === "offline") {
    const cached = req.sample_id
      ? analyzeCachedSample(req.sample_id, meta, inspectionId)
      : null;
    outcome =
      cached || {
        status: "manual_required",
        source: "manual",
        result: null,
        raw_text: "",
        attempts: 0,
        latency_ms: 0,
        errors: ["AI_MODE=offline and no cached sample response exists for this image"],
        routing_reasons: [],
        original_ai_disposition: null,
        model_id: GEMMA_MODEL_ID,
      };
  } else {
    // AI_MODE === "auto" or "live"
    try {
      outcome = await analyzeLiveWithGemma(imageBase64Raw, mimeType, meta, inspectionId);
      if (req.sample_id && outcome.status === "ok") {
        saveSampleCache(req.sample_id, outcome);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (err instanceof GemmaUnavailableError && AI_MODE === "auto" && req.sample_id) {
        const cached = analyzeCachedSample(req.sample_id, meta, inspectionId);
        if (cached) {
          cached.errors.push(`Live Gemini API unavailable (${errMsg}); used cached Gemma 4 response`);
          outcome = cached;
        } else {
          outcome = {
            status: "manual_required",
            source: "manual",
            result: null,
            raw_text: "",
            attempts: 1,
            latency_ms: 0,
            errors: [errMsg],
            routing_reasons: [],
            original_ai_disposition: null,
            model_id: GEMMA_MODEL_ID,
          };
        }
      } else {
        outcome = {
          status: "manual_required",
          source: "manual",
          result: null,
          raw_text: "",
          attempts: 1,
          latency_ms: 0,
          errors: [errMsg],
          routing_reasons: [],
          original_ai_disposition: null,
          model_id: GEMMA_MODEL_ID,
        };
      }
    }
  }

  outcome = applySafetyRules(outcome, meta, inspectionId);

  const record: InspectionRecord = {
    id: inspectionId,
    created_at: now.toISOString(),
    shift,
    board_id: meta.board_id,
    board_revision: meta.board_revision || "A",
    line_station: meta.line_station,
    operator_id: meta.operator_id,
    inspection_type: meta.inspection_type || "post_reflow",
    image_filename: imageFilename,
    image_sha256: imageSha256,
    sample_id: req.sample_id || null,
    reference_label: referenceLabel,
    precheck: (req.precheck as Record<string, unknown>) || {},
    ai_source: outcome.source,
    model_id: outcome.model_id,
    prompt_version: PROMPT_VERSION,
    prompt_sha: PROMPT_SHA256,
    ai_raw_text: outcome.raw_text,
    ai_result: outcome.result,
    ai_attempts: outcome.attempts,
    ai_latency_ms: outcome.latency_ms,
    ai_errors: outcome.errors,
    routing_reasons: outcome.routing_reasons,
    original_ai_disposition: outcome.original_ai_disposition,
    status: outcome.status === "ok" ? "pending_review" : "manual_required",
    final_defects: null,
    defect_reviews: null,
    final_disposition: null,
    reviewer_id: null,
    reviewed_at: null,
    human_agreement: null,
    review_notes: null,
    doc_time_s: null,
    started_at: req.started_at || now.toISOString(),
  };

  const { record: savedRecord, storage_backend } = await insertInspectionRecord(record);

  return NextResponse.json({
    inspection: savedRecord,
    storage_backend,
    ai_outcome: outcome,
  });
}

