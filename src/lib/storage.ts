import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dns from "dns";
import fs from "fs";
import path from "path";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore on runtimes without dns.setDefaultResultOrder
}
import { SUPABASE_KEY, SUPABASE_TABLE, SUPABASE_URL } from "./config";
import { Defect, DefectReview, FinalDisposition, InspectionResult, Metadata } from "./schema";

export interface InspectionRecord {
  id: string;
  created_at: string;
  shift: string;
  board_id: string;
  board_revision: string;
  line_station: string;
  operator_id: string;
  inspection_type: string;
  image_filename: string | null;
  image_sha256: string | null;
  sample_id: string | null;
  reference_label: string | null;
  precheck: Record<string, unknown>;
  ai_source: string;
  model_id: string;
  prompt_version: string;
  prompt_sha: string;
  ai_raw_text: string;
  ai_result: InspectionResult | null;
  ai_attempts: number;
  ai_latency_ms: number;
  ai_errors: string[];
  routing_reasons: string[];
  original_ai_disposition: string | null;
  status: "pending_review" | "manual_required" | "confirmed" | "escalated";
  final_defects: Array<{
    defect_class: string;
    severity: string;
    location_hint: string;
    source: "ai_accepted" | "ai_edited" | "human_added" | "ai_escalated";
    note?: string;
  }> | null;
  defect_reviews: DefectReview[] | null;
  final_disposition: FinalDisposition | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  human_agreement: "agree" | "partial" | "disagree" | null;
  review_notes: string | null;
  doc_time_s: number | null;
  started_at: string | null;
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

const LOCAL_STORE_PATH = path.join(process.cwd(), "data", "local_records.json");
let memoryStore: Map<string, InspectionRecord> = new Map();
let localLoaded = false;

function loadLocalStore(): Map<string, InspectionRecord> {
  if (localLoaded) return memoryStore;
  localLoaded = true;
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, "utf-8")) as InspectionRecord[];
      for (const item of raw) {
        memoryStore.set(item.id, item);
      }
    }
  } catch {
    // Ignore read errors
  }
  return memoryStore;
}

function saveLocalStore(): void {
  try {
    const dir = path.dirname(LOCAL_STORE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const arr = Array.from(memoryStore.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(arr, null, 2), "utf-8");
  } catch {
    // Ignore on read-only serverless fs
  }
}

export function generateInspectionId(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(16).slice(2, 6);
  return `INS-${datePart}-${timePart}-${rand}`;
}

export function computeShift(now = new Date()): string {
  const h = now.getHours();
  if (h >= 7 && h < 15) return "Shift A (07:00-15:00)";
  if (h >= 15 && h < 23) return "Shift B (15:00-23:00)";
  return "Shift C (23:00-07:00)";
}

export async function insertInspectionRecord(
  record: InspectionRecord
): Promise<{ record: InspectionRecord; storage_backend: "supabase" | "local" }> {
  const store = loadLocalStore();
  store.set(record.id, record);
  saveLocalStore();

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from(SUPABASE_TABLE)
      .insert(record)
      .select()
      .single();
    if (!error && data) {
      return { record: data as InspectionRecord, storage_backend: "supabase" };
    }
    console.warn("Supabase insert fallback to local:", error?.message);
  }
  return { record, storage_backend: "local" };
}

export async function getInspectionRecord(id: string): Promise<InspectionRecord | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from(SUPABASE_TABLE)
      .select("*")
      .eq("id", id)
      .single();
    if (!error && data) {
      return data as InspectionRecord;
    }
  }
  const store = loadLocalStore();
  return store.get(id) || null;
}

export async function listInspectionRecords(limit = 100): Promise<{
  records: InspectionRecord[];
  storage_backend: "supabase" | "local";
}> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from(SUPABASE_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!error && Array.isArray(data)) {
      return {
        records: data as InspectionRecord[],
        storage_backend: "supabase",
      };
    }
  }
  const store = loadLocalStore();
  const records = Array.from(store.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
  return { records, storage_backend: "local" };
}

export function computeHumanAgreement(
  aiDefects: Defect[],
  reviews: DefectReview[]
): "agree" | "partial" | "disagree" {
  const aiReviews = reviews.filter((r) => r.ai_index !== null && r.ai_index !== undefined);
  const humanAdded = reviews.filter((r) => r.ai_index === null || r.ai_index === undefined);

  if (aiDefects.length === 0) {
    return humanAdded.length === 0 ? "agree" : "disagree";
  }

  const acceptedCount = aiReviews.filter((r) => r.action === "accept").length;
  const rejectedCount = aiReviews.filter((r) => r.action === "reject").length;

  if (acceptedCount === aiDefects.length && humanAdded.length === 0) {
    return "agree";
  }
  if (rejectedCount === aiDefects.length) {
    return "disagree";
  }
  return "partial";
}

export async function saveHumanReview(
  id: string,
  payload: {
    reviewer_id: string;
    defect_reviews: DefectReview[];
    final_disposition: FinalDisposition;
    notes: string;
    doc_time_s?: number | null;
  }
): Promise<InspectionRecord | null> {
  const existing = await getInspectionRecord(id);
  if (!existing) return null;

  const aiDefects: Defect[] = existing.ai_result?.defects || [];
  const agreement = computeHumanAgreement(aiDefects, payload.defect_reviews);

  const finalDefects = payload.defect_reviews
    .filter((r) => r.action !== "reject")
    .map((r) => ({
      defect_class: r.defect_class,
      severity: r.severity,
      location_hint: r.location_hint,
      source: (
        r.ai_index === null || r.ai_index === undefined
          ? "human_added"
          : r.action === "accept"
          ? "ai_accepted"
          : r.action === "edit"
          ? "ai_edited"
          : "ai_escalated"
      ) as "ai_accepted" | "ai_edited" | "human_added" | "ai_escalated",
      note: r.note || "",
    }));

  const newStatus: InspectionRecord["status"] =
    payload.final_disposition === "escalate" ? "escalated" : "confirmed";
  const reviewedAt = new Date().toISOString();

  const updatedFields = {
    status: newStatus,
    final_defects: finalDefects,
    defect_reviews: payload.defect_reviews,
    final_disposition: payload.final_disposition,
    reviewer_id: payload.reviewer_id,
    reviewed_at: reviewedAt,
    human_agreement: agreement,
    review_notes: payload.notes || "",
    doc_time_s: payload.doc_time_s ?? existing.doc_time_s ?? null,
  };

  const updatedRecord: InspectionRecord = {
    ...existing,
    ...updatedFields,
  };

  const store = loadLocalStore();
  store.set(id, updatedRecord);
  saveLocalStore();

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from(SUPABASE_TABLE)
      .update(updatedFields)
      .eq("id", id)
      .select()
      .single();
    if (!error && data) {
      return data as InspectionRecord;
    }
  }

  return updatedRecord;
}

export async function computeDashboardStats() {
  const { records, storage_backend } = await listInspectionRecords(500);
  const total = records.length;
  const pending = records.filter(
    (r) => r.status === "pending_review" || r.status === "manual_required"
  ).length;
  const confirmed = records.filter((r) => r.status === "confirmed").length;
  const escalated = records.filter((r) => r.status === "escalated").length;
  const humanVerified = records.filter(
    (r) => r.status === "confirmed" || r.status === "escalated"
  );

  const defectClassCounts: Record<string, number> = {
    missing_component: 0,
    solder_bridge: 0,
    polarity_error: 0,
    tombstoning: 0,
    component_shift: 0,
    uncertain_or_other: 0,
  };

  const severityCounts: Record<string, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  const dispositionCounts: Record<string, number> = {
    pass: 0,
    rework: 0,
    quarantine: 0,
    escalate: 0,
  };

  const agreementCounts: Record<string, number> = {
    agree: 0,
    partial: 0,
    disagree: 0,
  };

  const byLine: Record<string, number> = {};
  const byOperator: Record<string, number> = {};
  const byShift: Record<string, number> = {};

  let aiFlagsTotal = 0;
  let aiFlagsAccepted = 0;
  let aiFlagsEdited = 0;
  let aiFlagsRejected = 0;
  let humanAddedTotal = 0;

  let traceableCompleteCount = 0;
  const docTimes: number[] = [];
  const latencies: number[] = [];

  for (const r of records) {
    if (r.ai_latency_ms > 0) latencies.push(r.ai_latency_ms);
    byLine[r.line_station] = (byLine[r.line_station] || 0) + 1;
    byOperator[r.operator_id] = (byOperator[r.operator_id] || 0) + 1;
    byShift[r.shift] = (byShift[r.shift] || 0) + 1;
  }

  for (const r of humanVerified) {
    if (r.final_disposition) {
      dispositionCounts[r.final_disposition] =
        (dispositionCounts[r.final_disposition] || 0) + 1;
    }
    if (r.human_agreement) {
      agreementCounts[r.human_agreement] =
        (agreementCounts[r.human_agreement] || 0) + 1;
    }
    if (typeof r.doc_time_s === "number" && r.doc_time_s > 0) {
      docTimes.push(r.doc_time_s);
    }

    const isTraceable = Boolean(
      r.id &&
        r.created_at &&
        r.board_id &&
        r.operator_id &&
        (r.image_sha256 || r.image_filename) &&
        r.model_id &&
        r.prompt_version &&
        r.final_disposition &&
        r.reviewer_id
    );
    if (isTraceable) traceableCompleteCount += 1;

    for (const d of r.final_defects || []) {
      defectClassCounts[d.defect_class] =
        (defectClassCounts[d.defect_class] || 0) + 1;
      severityCounts[d.severity] = (severityCounts[d.severity] || 0) + 1;
    }

    for (const rev of r.defect_reviews || []) {
      if (rev.ai_index === null || rev.ai_index === undefined) {
        humanAddedTotal += 1;
      } else {
        aiFlagsTotal += 1;
        if (rev.action === "accept" || rev.action === "escalate") {
          aiFlagsAccepted += 1;
        } else if (rev.action === "edit") {
          aiFlagsEdited += 1;
        } else if (rev.action === "reject") {
          aiFlagsRejected += 1;
        }
      }
    }
  }

  const precisionPct =
    aiFlagsTotal > 0 ? Math.round((aiFlagsAccepted / aiFlagsTotal) * 1000) / 10 : null;
  const falseCallPct =
    aiFlagsTotal > 0 ? Math.round((aiFlagsRejected / aiFlagsTotal) * 1000) / 10 : null;
  const totalTrueDefects = aiFlagsAccepted + aiFlagsEdited + humanAddedTotal;
  const recallProxyPct =
    totalTrueDefects > 0
      ? Math.round(((aiFlagsAccepted + aiFlagsEdited) / totalTrueDefects) * 1000) / 10
      : null;
  const traceabilityPct =
    humanVerified.length > 0
      ? Math.round((traceableCompleteCount / humanVerified.length) * 1000) / 10
      : 100;
  const avgDocTimeS =
    docTimes.length > 0
      ? Math.round((docTimes.reduce((a, b) => a + b, 0) / docTimes.length) * 10) / 10
      : null;
  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  const paretoDefects = Object.entries(defectClassCounts)
    .map(([defect_class, count]) => ({ defect_class, count }))
    .sort((a, b) => b.count - a.count);

  return {
    storage_backend,
    counts: {
      total,
      pending_review: pending,
      confirmed,
      escalated,
      human_verified: humanVerified.length,
    },
    kpis: {
      ai_precision_pct: precisionPct,
      false_call_rate_pct: falseCallPct,
      ai_recall_proxy_pct: recallProxyPct,
      traceability_completeness_pct: traceabilityPct,
      avg_doc_time_s: avgDocTimeS,
      avg_ai_latency_ms: avgLatencyMs,
      ai_flags_total: aiFlagsTotal,
      ai_flags_accepted: aiFlagsAccepted,
      ai_flags_edited: aiFlagsEdited,
      ai_flags_rejected: aiFlagsRejected,
      human_added_defects: humanAddedTotal,
    },
    pareto_defects: paretoDefects,
    severity_counts: severityCounts,
    disposition_counts: dispositionCounts,
    agreement_counts: agreementCounts,
    by_line: byLine,
    by_operator: byOperator,
    by_shift: byShift,
  };
}
