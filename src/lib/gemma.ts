import dns from "dns";
import fs from "fs";
import path from "path";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore on runtimes without dns.setDefaultResultOrder
}
import {
  AI_TIMEOUT_MS,
  CONFIDENCE_THRESHOLD,
  GEMINI_API_BASE,
  GEMINI_API_KEY,
  GEMMA_MODEL_ID,
  PROMPT_SHA256,
  PROMPT_TEMPLATE,
  PROMPT_VERSION,
} from "./config";
import { InspectionResult, InspectionResultSchema, Metadata } from "./schema";

export class GemmaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GemmaUnavailableError";
  }
}

export interface AIOutcome {
  status: "ok" | "manual_required";
  source: "live" | "cached" | "manual";
  result: InspectionResult | null;
  raw_text: string;
  attempts: number;
  latency_ms: number;
  errors: string[];
  routing_reasons: string[];
  original_ai_disposition: string | null;
  model_id: string;
}

export function buildPrompt(meta: Metadata, inspectionId: string): string {
  const replacements: Record<string, string> = {
    board_id: meta.board_id || "",
    inspection_id: inspectionId,
    board_revision: meta.board_revision || "A",
    line_station: meta.line_station || "",
    inspection_type: meta.inspection_type || "post_reflow",
    threshold: CONFIDENCE_THRESHOLD.toFixed(2),
  };

  let prompt = PROMPT_TEMPLATE;
  for (const [k, v] of Object.entries(replacements)) {
    prompt = prompt.replaceAll(`{${k}}`, v);
  }
  return prompt;
}

export function extractJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function validateInspectionResult(text: string): InspectionResult {
  const rawObj = extractJsonObject(text);
  return InspectionResultSchema.parse(rawObj);
}

async function callGemmaGenerateContent(
  contents: Array<Record<string, unknown>>
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new GemmaUnavailableError("GEMINI_API_KEY is not configured");
  }

  const candidateModels = [
    GEMMA_MODEL_ID,
    GEMMA_MODEL_ID === "gemma-4-26b-a4b-it" ? "gemma-4-31b-it" : "gemma-4-26b-a4b-it",
  ];

  let res: Response | null = null;
  let lastErrText = "";

  for (let attempt = 0; attempt < candidateModels.length; attempt++) {
    const modelToUse = candidateModels[attempt];
    const url = `${GEMINI_API_BASE}/models/${modelToUse}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.1,
            topP: 0.9,
            maxOutputTokens: 4096,
          },
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      lastErrText = `Network error calling Gemini API (${modelToUse}): ${msg}`;
      continue;
    }
    clearTimeout(timer);

    if (res.ok) {
      break;
    }

    const bodyText = await res.text().catch(() => "");
    lastErrText = `Gemini API HTTP ${res.status} (${modelToUse}): ${bodyText.slice(0, 400)}`;
    if (res.status !== 500 && res.status !== 503 && res.status !== 429) {
      break;
    }
  }

  if (!res || !res.ok) {
    throw new GemmaUnavailableError(lastErrText || "Gemini API request failed");
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string; thought?: boolean }>;
      };
    }>;
  };

  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts || !Array.isArray(parts)) {
    throw new GemmaUnavailableError(
      `Unexpected Gemini API response structure: ${JSON.stringify(data).slice(0, 400)}`
    );
  }

  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text || "")
    .join("");
}

export async function analyzeLiveWithGemma(
  imageBase64Raw: string,
  mimeType: string,
  meta: Metadata,
  inspectionId: string
): Promise<AIOutcome> {
  const prompt = buildPrompt(meta, inspectionId);
  const imagePart = {
    inline_data: {
      mime_type: mimeType,
      data: imageBase64Raw,
    },
  };

  const contents: Array<Record<string, unknown>> = [
    {
      role: "user",
      parts: [imagePart, { text: prompt }],
    },
  ];

  const outcome: AIOutcome = {
    status: "manual_required",
    source: "live",
    result: null,
    raw_text: "",
    attempts: 0,
    latency_ms: 0,
    errors: [],
    routing_reasons: [],
    original_ai_disposition: null,
    model_id: GEMMA_MODEL_ID,
  };

  const t0 = Date.now();
  // First attempt + at most ONE retry on schema/JSON validation failure
  for (const attempt of [1, 2]) {
    outcome.attempts = attempt;
    const text = await callGemmaGenerateContent(contents);
    outcome.raw_text = text;
    try {
      const validated = validateInspectionResult(text);
      outcome.status = "ok";
      outcome.result = validated;
      break;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message.slice(0, 600) : String(err).slice(0, 600);
      outcome.errors.push(`attempt ${attempt}: invalid JSON/schema: ${errMsg}`);
      contents.push(
        {
          role: "model",
          parts: [{ text }],
        },
        {
          role: "user",
          parts: [
            {
              text:
                `Your previous response did not match the required JSON schema. Validation error: ${errMsg}\n` +
                `Return ONLY the corrected JSON object with no markdown fences, using ONLY the six allowed defect_class values.`,
            },
          ],
        }
      );
    }
  }
  outcome.latency_ms = Date.now() - t0;
  return outcome;
}

export function getCacheDir(): string {
  return path.join(process.cwd(), "sample_data", "cached_responses");
}

export function analyzeCachedSample(
  sampleId: string,
  _meta: Metadata,
  _inspectionId: string
): AIOutcome | null {
  const cachePath = path.join(getCacheDir(), `${sampleId}.json`);
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as {
      model_id?: string;
      recorded_at?: string;
      latency_ms?: number;
      raw_text?: string;
    };
    const outcome: AIOutcome = {
      status: "manual_required",
      source: "cached",
      result: null,
      raw_text: cached.raw_text || "",
      attempts: 1,
      latency_ms: cached.latency_ms || 0,
      errors: [],
      routing_reasons: [
        `Offline fallback: replayed cached Gemma 4 output recorded at ${cached.recorded_at || "demo cache"}`,
      ],
      original_ai_disposition: null,
      model_id: cached.model_id || GEMMA_MODEL_ID,
    };

    const validated = validateInspectionResult(outcome.raw_text);
    outcome.status = "ok";
    outcome.result = validated;
    return outcome;
  } catch (err: unknown) {
    return null;
  }
}

export function saveSampleCache(sampleId: string, outcome: AIOutcome): void {
  if (outcome.status !== "ok" || !outcome.raw_text) return;
  try {
    const dir = getCacheDir();
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      sample_id: sampleId,
      model_id: outcome.model_id,
      prompt_version: PROMPT_VERSION,
      prompt_sha256: PROMPT_SHA256,
      recorded_at: new Date().toISOString(),
      latency_ms: outcome.latency_ms,
      raw_text: outcome.raw_text,
    };
    fs.writeFileSync(
      path.join(dir, `${sampleId}.json`),
      JSON.stringify(payload, null, 2),
      "utf-8"
    );
  } catch {
    // Ignore read-only filesystem errors on serverless edge environments
  }
}

export function applySafetyRules(
  outcome: AIOutcome,
  meta: Metadata,
  inspectionId: string
): AIOutcome {
  if (outcome.status !== "ok" || !outcome.result) {
    outcome.routing_reasons.push(
      "AI output unavailable or invalid after retry -> routed to manual inspector entry"
    );
    return outcome;
  }

  const r = outcome.result;
  r.board_id = meta.board_id;
  r.inspection_id = inspectionId;
  r.model = "gemma-4-multimodal";
  r.operator_confirmation_required = true;
  outcome.original_ai_disposition = r.overall_disposition;

  const lowConf = r.defects.filter((d) => d.confidence < CONFIDENCE_THRESHOLD);
  if (lowConf.length > 0) {
    outcome.routing_reasons.push(
      `${lowConf.length} defect(s) have confidence below threshold (${CONFIDENCE_THRESHOLD.toFixed(2)})`
    );
  }

  if (r.image_quality !== "acceptable") {
    outcome.routing_reasons.push(
      `Image quality assessed as '${r.image_quality}' — requires human visual check`
    );
  }

  if (r.overall_disposition === "pass" && r.defects.length > 0) {
    outcome.routing_reasons.push(
      "AI suggested 'pass' while reporting visible defects — overridden to human verification"
    );
  }

  const hasNonOfflineReasons = outcome.routing_reasons.some(
    (reason) => !reason.toLowerCase().startsWith("offline")
  );

  if (hasNonOfflineReasons) {
    r.overall_disposition = "requires_human_verification";
  }

  if (r.overall_disposition === "pass") {
    outcome.routing_reasons.push(
      "AI suggests no visible defects ('pass' candidate); mandatory human confirmation required before release"
    );
  }

  return outcome;
}
