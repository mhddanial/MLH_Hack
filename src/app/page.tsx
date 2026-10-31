"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  Download,
  Edit3,
  Eye,
  FileJson,
  FileSpreadsheet,
  Filter,
  Layers,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

type DefectClass =
  | "missing_component"
  | "solder_bridge"
  | "polarity_error"
  | "tombstoning"
  | "component_shift"
  | "uncertain_or_other";

type Severity = "low" | "medium" | "high";
type ReviewAction = "accept" | "edit" | "reject" | "escalate";
type FinalDisposition = "pass" | "rework" | "quarantine" | "escalate";

interface BBoxItem {
  orig_label: string;
  bbox_norm: [number, number, number, number];
  quadrant: string;
}

interface SampleItem {
  id: string;
  title: string;
  category: string;
  orig_defect_class: string;
  expected_defect_class: string;
  expected_severity: string;
  expected_disposition: string;
  board_id: string;
  image_url: string;
  width: number;
  height: number;
  location_hint: string;
  bboxes?: BBoxItem[];
  is_golden: boolean;
  description: string;
  has_cache?: boolean;
}

interface AIDefect {
  defect_class: DefectClass;
  location_hint: string;
  confidence: number;
  severity: Severity;
  evidence: string;
  recommended_action: string;
}

interface AIInspectionResult {
  board_id: string;
  inspection_id: string;
  image_quality: "acceptable" | "poor" | "unusable";
  defects: AIDefect[];
  overall_disposition: string;
  visible_labels: string[];
  notes: string;
  model: string;
  operator_confirmation_required: boolean;
}

interface DefectReviewState {
  ai_index: number | null;
  action: ReviewAction;
  defect_class: DefectClass;
  severity: Severity;
  location_hint: string;
  note: string;
}

interface InspectionRecord {
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
  ai_result: AIInspectionResult | null;
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
    source: string;
    note?: string;
  }> | null;
  defect_reviews: DefectReviewState[] | null;
  final_disposition: FinalDisposition | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  human_agreement: "agree" | "partial" | "disagree" | null;
  review_notes: string | null;
  doc_time_s: number | null;
  started_at: string | null;
}

interface AppConfig {
  app_version: string;
  model_id: string;
  prompt_version: string;
  prompt_sha256: string;
  confidence_threshold: number;
  ai_mode: string;
  gemini_key_configured: boolean;
  supabase_configured: boolean;
  supabase_table: string;
  defect_classes: DefectClass[];
  severities: Severity[];
  final_dispositions: FinalDisposition[];
  demo_operators: string[];
  demo_lines: string[];
  inspection_types: string[];
}

interface DashboardStats {
  storage_backend: string;
  counts: {
    total: number;
    pending_review: number;
    confirmed: number;
    escalated: number;
    human_verified: number;
  };
  kpis: {
    ai_precision_pct: number | null;
    false_call_rate_pct: number | null;
    ai_recall_proxy_pct: number | null;
    traceability_completeness_pct: number;
    avg_doc_time_s: number | null;
    avg_ai_latency_ms: number | null;
    ai_flags_total: number;
    ai_flags_accepted: number;
    ai_flags_edited: number;
    ai_flags_rejected: number;
    human_added_defects: number;
  };
  pareto_defects: Array<{ defect_class: string; count: number }>;
  severity_counts: Record<string, number>;
  disposition_counts: Record<string, number>;
  agreement_counts: Record<string, number>;
  by_line: Record<string, number>;
  by_operator: Record<string, number>;
  by_shift: Record<string, number>;
}

// ============================================================================
// NATURAL HUMAN-READABLE LABELS & FORMATTERS
// ============================================================================

const DEFECT_LABELS: Record<DefectClass, string> = {
  missing_component: "Missing Component",
  solder_bridge: "Solder Bridge / Short",
  polarity_error: "Wrong Polarity / Orientation",
  tombstoning: "Tombstoning (Lifted Chip)",
  component_shift: "Misaligned / Shifted Component",
  uncertain_or_other: "Surface / Copper Trace Anomaly",
};

const DEFECT_DESCRIPTIONS: Record<DefectClass, string> = {
  missing_component: "Empty solder pad where a component should be mounted",
  solder_bridge: "Unintended solder or copper joining adjacent pads or pins",
  polarity_error: "Diode, capacitor, or IC mounted in reverse orientation",
  tombstoning: "Small chip component lifted vertically off one pad",
  component_shift: "Component skewed, rotated, or shifted off its solder pads",
  uncertain_or_other: "Open copper trace, pinhole, copper spur, or ambiguous surface mark",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  high: "High Priority",
  medium: "Medium Priority",
  low: "Low Priority",
};

const DISPOSITION_INFO: Record<
  FinalDisposition,
  {
    shortLabel: string;
    label: string;
    desc: string;
    borderColor: string;
    bgColor: string;
    textColor: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  pass: {
    shortLabel: "Pass",
    label: "Pass — Release Board",
    desc: "Board meets visible quality criteria; release to the next station.",
    borderColor: "border-[#24a148]",
    bgColor: "bg-[#24a148]",
    textColor: "text-[#ffffff]",
    badgeBg: "bg-[#24a148]",
    badgeText: "text-[#ffffff]",
  },
  rework: {
    shortLabel: "Send to Rework",
    label: "Send to Rework Bench",
    desc: "Visible solder or placement issue that can be repaired by touch-up.",
    borderColor: "border-[#0f62fe]",
    bgColor: "bg-[#0f62fe]",
    textColor: "text-[#ffffff]",
    badgeBg: "bg-[#0f62fe]",
    badgeText: "text-[#ffffff]",
  },
  quarantine: {
    shortLabel: "Quarantine",
    label: "Quarantine Board (Hold)",
    desc: "Critical defect or board damage; isolate in the hold area for review.",
    borderColor: "border-[#da1e28]",
    bgColor: "bg-[#da1e28]",
    textColor: "text-[#ffffff]",
    badgeBg: "bg-[#da1e28]",
    badgeText: "text-[#ffffff]",
  },
  escalate: {
    shortLabel: "Escalate to QA",
    label: "Escalate to Senior QA / X-Ray",
    desc: "Uncertain surface mark or suspected hidden joint needing senior QA or X-ray.",
    borderColor: "border-[#f1c21b]",
    bgColor: "bg-[#f1c21b]",
    textColor: "text-[#161616]",
    badgeBg: "bg-[#f1c21b]",
    badgeText: "text-[#161616]",
  },
};

function formatDefectClass(cls: string | null | undefined): string {
  if (!cls || cls === "none" || cls === "clean") return "Clean Reference (No Defects)";
  if (cls in DEFECT_LABELS) return DEFECT_LABELS[cls as DefectClass];
  return cls
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatOrigSubcategory(orig: string | null | undefined): string {
  if (!orig) return "";
  const map: Record<string, string> = {
    Short: "Copper Short / Bridge",
    Open_circuit: "Broken Copper Trace",
    Mouse_bite: "Copper Edge Notch",
    Spur: "Copper Protrusion",
    Missing_hole: "Unpunched Via / Drill Hole",
    Spurious_copper: "Excess Copper Residue",
    Clean: "Clean Reference Board",
  };
  return map[orig] || orig.replace(/_/g, " ");
}

function formatLineStation(line: string | null | undefined): string {
  if (!line) return "Line 1 · Post-Reflow";
  const map: Record<string, string> = {
    "Line-1-PostReflow": "Line 1 · Post-Reflow Station",
    "Line-2-FirstArticle": "Line 2 · First-Article Bench",
    "SMK-Lab-Bench-A": "SMK Training Lab · Bench A",
    "Rework-Cell-01": "Rework & Touch-Up Cell 1",
    "SMT-L1 / AOI-Lite-1": "Line 1 · Post-Reflow Station",
    "SMT-L2 / AOI-Lite-2": "Line 2 · First-Article Bench",
  };
  return map[line] || line.replace(/-/g, " · ");
}

function formatInspectionStage(stage: string | null | undefined): string {
  if (!stage) return "Post-Reflow Inspection";
  const map: Record<string, string> = {
    post_reflow: "Post-Reflow Soldering Check",
    first_article: "First-Article Setup Check",
    rework_verification: "Post-Rework Verification",
    smk_lab_training: "SMK Student Lab Practice",
  };
  return (
    map[stage] ||
    stage
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatOperatorName(op: string | null | undefined): string {
  if (!op) return "Unassigned Inspector";
  // e.g. "OP-BTM-01 (Siti - Line 1)" -> "Siti (Line 1)"
  const match = op.match(/\(([^)]+)\)/);
  if (match) {
    return match[1].replace(" - ", " · ");
  }
  return op;
}

function formatDispositionLabel(disp: string | null | undefined): string {
  if (!disp) return "Needs Operator Review";
  const d = disp.toLowerCase();
  if (d in DISPOSITION_INFO) {
    return DISPOSITION_INFO[d as FinalDisposition].shortLabel;
  }
  if (d === "requires_human_verification") return "Closer Inspection Needed";
  if (d === "manual_entry" || d === "manual") return "Manual Inspection";
  return disp.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatStatusBadge(status: InspectionRecord["status"]): {
  label: string;
  bg: string;
  text: string;
} {
  switch (status) {
    case "confirmed":
      return { label: "Verified", bg: "bg-[#24a148]", text: "text-[#ffffff]" };
    case "escalated":
      return { label: "Escalated to QA", bg: "bg-[#f1c21b]", text: "text-[#161616]" };
    case "manual_required":
      return { label: "Manual Entry", bg: "bg-[#0f62fe]", text: "text-[#ffffff]" };
    case "pending_review":
    default:
      return { label: "Needs Review", bg: "bg-[#f1c21b]", text: "text-[#161616]" };
  }
}

function formatAgreementLabel(agreement: InspectionRecord["human_agreement"]): string {
  if (!agreement) return "Waiting for Sign-Off";
  switch (agreement) {
    case "agree":
      return "Confirmed AI Finding";
    case "partial":
      return "Adjusted by Operator";
    case "disagree":
      return "Overridden by Operator";
    default:
      return "Waiting for Sign-Off";
  }
}

function formatAiSourceLabel(source: string, latencyMs?: number): string {
  if (source === "live_gemma" || source === "live") {
    const sec = latencyMs ? ` (${(latencyMs / 1000).toFixed(1)}s)` : "";
    return `Live AI Check${sec}`;
  }
  if (source === "cached_sample" || source === "cached") {
    return "Instant Reference Sample";
  }
  return "Manual Inspector Entry";
}

function formatFriendlyDateTime(iso: string): { time: string; date: string } {
  try {
    const d = new Date(iso);
    return {
      time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    };
  } catch {
    return { time: "—", date: "—" };
  }
}

function summarizeRecordFindings(rec: InspectionRecord): string {
  const finalList = rec.final_defects;
  if (finalList && finalList.length > 0) {
    const first = formatDefectClass(finalList[0].defect_class);
    return finalList.length === 1
      ? `1 issue: ${first}`
      : `${finalList.length} issues (${first} +${finalList.length - 1})`;
  }
  if (rec.status === "confirmed" && (!finalList || finalList.length === 0)) {
    return "No issues found (Clean board)";
  }
  const aiList = rec.ai_result?.defects || [];
  if (aiList.length > 0) {
    const first = formatDefectClass(aiList[0].defect_class);
    return aiList.length === 1
      ? `1 flagged: ${first}`
      : `${aiList.length} flagged (${first} +${aiList.length - 1})`;
  }
  return "No visible issues flagged";
}

async function computeSha256Hex(dataUrl: string): Promise<string> {
  try {
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

export default function AOILiteBatamApp() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"inspect" | "records" | "dashboard">("inspect");

  // Config & data state
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [sampleFilter, setSampleFilter] = useState<"all" | "smt" | "pku" | "golden">("all");
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [storageBackend, setStorageBackend] = useState<string>("supabase");
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Step 1: Capture / Image Source
  const [captureMode, setCaptureMode] = useState<"sample" | "upload" | "camera">("sample");
  const [selectedSampleId, setSelectedSampleId] = useState<string>("smt_missing_comp_01");
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [imageSha256, setImageSha256] = useState<string>("");
  const [precheckInfo, setPrecheckInfo] = useState<{
    width: number;
    height: number;
    brightness: number;
    status: "Acceptable" | "Low light" | "Overexposed";
  } | null>(null);
  const [showGroundTruthBoxes, setShowGroundTruthBoxes] = useState<boolean>(false);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Step 2: Station & Board Details (compact bar by default, expandable)
  const [showStationEditor, setShowStationEditor] = useState<boolean>(false);
  const [boardId, setBoardId] = useState<string>("BAT-SMT-201");
  const [boardRevision, setBoardRevision] = useState<string>("A");
  const [lineStation, setLineStation] = useState<string>("Line-1-PostReflow");
  const [operatorId, setOperatorId] = useState<string>("OP-BTM-01 (Siti - Line 1)");
  const [inspectionType, setInspectionType] = useState<string>("post_reflow");
  const [startedAtIso, setStartedAtIso] = useState<string>(() => new Date().toISOString());
  const [elapsedDocSec, setElapsedDocSec] = useState<number>(0);

  // Analysis progress & active inspection
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeElapsedMs, setAnalyzeElapsedMs] = useState<number>(0);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [currentRecord, setCurrentRecord] = useState<InspectionRecord | null>(null);
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);

  // Step 3 & 4: Human-in-the-loop review state
  const [defectReviews, setDefectReviews] = useState<DefectReviewState[]>([]);
  const [finalDisposition, setFinalDisposition] = useState<FinalDisposition | "">("");
  const [reviewerId, setReviewerId] = useState<string>("OP-BTM-01 (Siti - Line 1)");
  const [reviewNotes, setReviewNotes] = useState<string>("");
  const [isSavingReview, setIsSavingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Records tab filter & detail drawer
  const [recordStatusFilter, setRecordStatusFilter] = useState<string>("all");
  const [selectedRecordDetail, setSelectedRecordDetail] = useState<InspectionRecord | null>(null);
  const [showDrawerTechAudit, setShowDrawerTechAudit] = useState<boolean>(false);

  // Analytics tab collapsible DMAIC methodology
  const [showDmaicDetails, setShowDmaicDetails] = useState<boolean>(false);

  // Load initial config, samples, records, stats
  const fetchAllData = useCallback(async () => {
    try {
      const [cfgRes, smpRes, recRes, stRes] = await Promise.all([
        fetch("/api/config"),
        fetch("/api/samples"),
        fetch("/api/inspections?limit=100"),
        fetch("/api/stats"),
      ]);
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as AppConfig;
        setConfig(cfg);
      }
      if (smpRes.ok) {
        const smpData = await smpRes.json();
        setSamples(smpData.samples || []);
      }
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecords(recData.inspections || []);
        if (recData.storage_backend) setStorageBackend(recData.storage_backend);
      }
      if (stRes.ok) {
        const stData = (await stRes.json()) as DashboardStats;
        setStats(stData);
      }
    } catch (err) {
      console.error("Failed initial fetch:", err);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Live documentation timer while an inspection is in progress
  useEffect(() => {
    if (currentRecord?.status === "confirmed" || currentRecord?.status === "escalated") {
      return;
    }
    const startMs = new Date(startedAtIso).getTime();
    const timer = setInterval(() => {
      const diff = Math.max(0, Math.round((Date.now() - startMs) / 1000));
      setElapsedDocSec(diff);
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAtIso, currentRecord?.status]);

  // Live timer during Gemma 4 analysis
  useEffect(() => {
    if (!isAnalyzing) {
      setAnalyzeElapsedMs(0);
      return;
    }
    const t0 = Date.now();
    const id = setInterval(() => {
      setAnalyzeElapsedMs(Date.now() - t0);
    }, 100);
    return () => clearInterval(id);
  }, [isAnalyzing]);

  // Selected sample object
  const selectedSample = useMemo(
    () => samples.find((s) => s.id === selectedSampleId) || samples[0] || null,
    [samples, selectedSampleId]
  );

  const filteredSamples = useMemo(() => {
    return samples.filter((s) => {
      if (sampleFilter === "all") return true;
      if (sampleFilter === "golden") return s.is_golden;
      if (sampleFilter === "smt") return s.id.startsWith("smt_");
      if (sampleFilter === "pku") return s.id.startsWith("pku_") && !s.is_golden;
      return true;
    });
  }, [samples, sampleFilter]);

  // When user picks a sample, auto-update boardId & reset current review
  const handleSelectSample = (sample: SampleItem) => {
    setCaptureMode("sample");
    setSelectedSampleId(sample.id);
    setUploadedDataUrl(null);
    setUploadedFileName(null);
    setBoardId(sample.board_id);
    setPrecheckInfo({
      width: sample.width,
      height: sample.height,
      brightness: 128,
      status: "Acceptable",
    });
    setStartedAtIso(new Date().toISOString());
    setCurrentRecord(null);
    setAnalyzeError(null);
  };

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(
        `Live camera preview is unavailable on this device (${msg}). Use the mobile camera / photo picker button below.`
      );
    }
  };

  // Client-side image resize + brightness precheck + SHA-256
  const processClientImage = async (fileOrBlob: Blob, fileName: string) => {
    const imgUrl = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.src = imgUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode image"));
    });

    const maxSide = 1400;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (Math.max(w, h) > maxSide) {
      const scale = maxSide / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h).data;
    let sumLum = 0;
    const step = 16;
    let count = 0;
    for (let i = 0; i < imgData.length; i += 4 * step) {
      sumLum += 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
      count++;
    }
    const meanBrightness = Math.round(sumLum / Math.max(1, count));
    const status: "Acceptable" | "Low light" | "Overexposed" =
      meanBrightness < 40
        ? "Low light"
        : meanBrightness > 235
        ? "Overexposed"
        : "Acceptable";

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    URL.revokeObjectURL(imgUrl);

    const sha = await computeSha256Hex(dataUrl);
    setUploadedDataUrl(dataUrl);
    setUploadedFileName(fileName);
    setImageSha256(sha);
    setPrecheckInfo({ width: w, height: h, brightness: meanBrightness, status });
    setStartedAtIso(new Date().toISOString());
    setCurrentRecord(null);
    setAnalyzeError(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processClientImage(file, file.name);
  };

  const captureSnapshotFromVideo = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.9)
    );
    if (blob) {
      stopCamera();
      await processClientImage(blob, `camera_${Date.now()}.jpg`);
    }
  };

  // Populate human review form from an InspectionRecord
  const initializeReviewFromRecord = (rec: InspectionRecord) => {
    setCurrentRecord(rec);
    setReviewerId(rec.operator_id || operatorId);
    const aiDefects = rec.ai_result?.defects || [];
    const confThresh = config?.confidence_threshold ?? 0.6;

    const initialReviews: DefectReviewState[] = aiDefects.map((d, idx) => ({
      ai_index: idx,
      action:
        d.confidence < confThresh || d.defect_class === "uncertain_or_other"
          ? "escalate"
          : "accept",
      defect_class: d.defect_class,
      severity: d.severity,
      location_hint: d.location_hint,
      note: "",
    }));
    setDefectReviews(initialReviews);

    // Pre-highlight the suggested decision so the operator can verify & confirm in 1 click
    const origDisp = rec.original_ai_disposition || rec.ai_result?.overall_disposition;
    if (origDisp === "rework" || origDisp === "quarantine" || origDisp === "escalate") {
      setFinalDisposition(origDisp);
    } else if (aiDefects.length === 0 && rec.status === "pending_review") {
      setFinalDisposition("pass");
    } else if (origDisp === "requires_human_verification") {
      setFinalDisposition(aiDefects.length > 0 ? "rework" : "pass");
    } else {
      setFinalDisposition("");
    }
    setReviewNotes(rec.review_notes || "");
    setReviewError(null);
  };

  // Trigger Gemma 4 Analysis or Manual Entry
  const handleAnalyze = async (forceManual = false) => {
    setAnalyzeError(null);
    setIsAnalyzing(true);
    try {
      const payload: Record<string, unknown> = {
        metadata: {
          board_id: boardId.trim() || "BAT-PCBA-001",
          board_revision: boardRevision.trim() || "A",
          line_station: lineStation,
          operator_id: operatorId,
          inspection_type: inspectionType,
        },
        started_at: startedAtIso,
        force_manual: forceManual,
        precheck: precheckInfo || {},
      };

      if (captureMode === "sample" && selectedSample) {
        payload.sample_id = selectedSample.id;
      } else if (uploadedDataUrl) {
        payload.image_base64 = uploadedDataUrl;
        payload.image_name = uploadedFileName || "captured_pcb.jpg";
        payload.image_sha256 = imageSha256;
      } else {
        setAnalyzeError("Please choose a sample board or upload/capture a photo first.");
        setIsAnalyzing(false);
        return;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to run inspection analysis");
      }

      const savedRec = data.inspection as InspectionRecord;
      if (data.storage_backend) setStorageBackend(data.storage_backend);
      initializeReviewFromRecord(savedRec);
      await fetchAllData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnalyzeError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Update a single defect review item
  const updateDefectReview = (index: number, patch: Partial<DefectReviewState>) => {
    setDefectReviews((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  // Add a human-detected missed defect
  const addHumanDefect = () => {
    setDefectReviews((prev) => [
      ...prev,
      {
        ai_index: null,
        action: "accept",
        defect_class: "solder_bridge",
        severity: "high",
        location_hint: "Specify component or area (e.g., U3 pins 4–5)",
        note: "Added by inspector during visual check",
      },
    ]);
  };

  const removeHumanDefect = (index: number) => {
    setDefectReviews((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Submit Human Confirmation
  const handleConfirmReview = async () => {
    if (!currentRecord) return;
    if (!finalDisposition) {
      setReviewError(
        "Please select a final decision (Pass, Send to Rework, Quarantine, or Escalate to QA) before completing the inspection."
      );
      return;
    }

    setReviewError(null);
    setIsSavingReview(true);
    try {
      const res = await fetch(`/api/inspections/${currentRecord.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewer_id: reviewerId || operatorId,
          defect_reviews: defectReviews,
          final_disposition: finalDisposition,
          notes: reviewNotes,
          doc_time_s: elapsedDocSec,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save inspection review");
      }
      setCurrentRecord(data.inspection as InspectionRecord);
      await fetchAllData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setReviewError(msg);
    } finally {
      setIsSavingReview(false);
    }
  };

  // Reset for next board inspection
  const handleStartNewInspection = () => {
    setCurrentRecord(null);
    setDefectReviews([]);
    setFinalDisposition("");
    setReviewNotes("");
    setAnalyzeError(null);
    setReviewError(null);
    setShowTechDetails(false);
    setShowRawJson(false);
    setStartedAtIso(new Date().toISOString());
    setElapsedDocSec(0);
  };

  // Current active workflow stage (1 = Select & Check, 2 = Review & Sign Off, 3 = Completed)
  const currentStage = useMemo(() => {
    if (!currentRecord) return 1;
    if (currentRecord.status === "confirmed" || currentRecord.status === "escalated") {
      return 3;
    }
    return 2;
  }, [currentRecord]);

  // Active preview image URL
  const activeImageUrl = useMemo(() => {
    if (captureMode === "sample" && selectedSample) {
      return selectedSample.image_url;
    }
    return uploadedDataUrl || null;
  }, [captureMode, selectedSample, uploadedDataUrl]);

  // Filtered records for Quality Log tab
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (recordStatusFilter === "all") return true;
      if (recordStatusFilter === "pending_review") {
        return r.status === "pending_review" || r.status === "manual_required";
      }
      return r.status === recordStatusFilter;
    });
  }, [records, recordStatusFilter]);

  // Compute Pass Rate for Analytics
  const passRatePct = useMemo(() => {
    if (!stats || !stats.counts.human_verified) return null;
    const passCount = stats.disposition_counts?.pass ?? 0;
    return Math.round((passCount / stats.counts.human_verified) * 100);
  }, [stats]);

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#161616]">
      {/* Carbon Safety Notice Bar (height: 32px, #f4f4f4 surface-1, clear human-readable notice) */}
      <div className="min-h-[32px] bg-[#f4f4f4] border-b border-[#e0e0e0] px-4 lg:px-8 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px] leading-[1.33] tracking-[0.32px] text-[#525252]">
        <div className="flex items-center gap-2 font-semibold text-[#161616]">
          <AlertTriangle className="w-3.5 h-3.5 text-[#da1e28] shrink-0" />
          <span>
            AI assistance only. Final quality disposition requires human verification. Hidden solder joints (BGA/QFN voids, head-in-pillow) require X-ray inspection.
          </span>
        </div>
        <div className="hidden xl:flex items-center gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-[#161616]">
            <span className="w-2 h-2 bg-[#24a148] inline-block" />
            <span>
              {storageBackend === "supabase" ? "Cloud Quality Log Connected" : "Offline Local Mode"}
            </span>
          </span>
        </div>
      </div>

      {/* Carbon Top Navigation */}
      <header className="min-h-[48px] bg-[#ffffff] border-b border-[#e0e0e0] px-4 lg:px-8 flex flex-wrap items-center justify-between">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2.5 py-2">
            <span className="inline-block w-3 h-3 bg-[#0f62fe]" />
            <span className="text-[16px] font-semibold tracking-[0.16px] text-[#161616]">
              AOI-Lite Batam: AI-Assisted SMT Inspection
            </span>
          </div>

          {/* Carbon Product Tabs */}
          <nav className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveTab("inspect")}
              className={`min-h-[48px] px-5 py-3 text-[14px] leading-[1.29] tracking-[0.16px] border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "inspect"
                  ? "border-[#0f62fe] text-[#161616] font-semibold bg-[#ffffff]"
                  : "border-transparent text-[#525252] hover:text-[#161616] hover:bg-[#f4f4f4]"
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Inspector Station</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("records")}
              className={`min-h-[48px] px-5 py-3 text-[14px] leading-[1.29] tracking-[0.16px] border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "records"
                  ? "border-[#0f62fe] text-[#161616] font-semibold bg-[#ffffff]"
                  : "border-transparent text-[#525252] hover:text-[#161616] hover:bg-[#f4f4f4]"
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Quality Log ({records.length})</span>
              {stats && stats.counts.pending_review > 0 && (
                <span className="bg-[#f1c21b] text-[#161616] text-[12px] font-semibold px-1.5 py-0.5">
                  {stats.counts.pending_review} needs review
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`min-h-[48px] px-5 py-3 text-[14px] leading-[1.29] tracking-[0.16px] border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "dashboard"
                  ? "border-[#0f62fe] text-[#161616] font-semibold bg-[#ffffff]"
                  : "border-transparent text-[#525252] hover:text-[#161616] hover:bg-[#f4f4f4]"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Quality Analytics</span>
            </button>
          </nav>
        </div>

        {/* Quick Export Buttons */}
        <div className="flex items-center gap-2 py-1.5">
          <a
            href="/api/export/csv"
            className="px-3 py-2 text-[12px] tracking-[0.32px] text-[#0f62fe] border border-[#0f62fe] hover:bg-[#0f62fe] hover:text-[#ffffff] transition-colors flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Spreadsheet (CSV)</span>
          </a>
          <a
            href="/api/export/json"
            className="px-3 py-2 text-[12px] tracking-[0.32px] text-[#161616] border border-[#e0e0e0] bg-[#f4f4f4] hover:bg-[#e0e0e0] transition-colors flex items-center gap-1.5"
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>Export Audit Report</span>
          </a>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1584px] mx-auto px-4 lg:px-8 py-6">
        {/* =================================================================== */}
        {/* TAB 1: INSPECTOR STATION (STREAMLINED 3-STAGE WORKFLOW)             */}
        {/* =================================================================== */}
        {activeTab === "inspect" && (
          <div className="space-y-6">
            {/* Compact Header + 3-Stage Stepper + Active Shift/Station Bar */}
            <section className="border border-[#e0e0e0] bg-[#ffffff]">
              <div className="p-5 lg:px-8 lg:py-6 border-b border-[#e0e0e0] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] tracking-[0.16px] text-[#0f62fe] mb-1">
                    Batam Electronics Manufacturing &amp; SMK Lab Quality Assistant
                  </p>
                  <h1 className="text-[28px] lg:text-[36px] font-light leading-[1.20] text-[#161616]">
                    Visual PCB Inspection Station
                  </h1>
                </div>

                {/* Active Station & Operator Quick Summary Bar */}
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <div className="bg-[#f4f4f4] border border-[#e0e0e0] px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      <span className="text-[#525252]">Inspector: </span>
                      <strong className="text-[#161616]">{formatOperatorName(operatorId)}</strong>
                    </span>
                    <span className="text-[#e0e0e0]">|</span>
                    <span>
                      <span className="text-[#525252]">Station: </span>
                      <strong className="text-[#161616]">{formatLineStation(lineStation)}</strong>
                    </span>
                    <span className="text-[#e0e0e0]">|</span>
                    <span>
                      <span className="text-[#525252]">Board: </span>
                      <strong className="text-[#161616]">
                        {boardId} (Rev {boardRevision})
                      </strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowStationEditor((v) => !v)}
                    className={`min-h-[38px] px-3 py-2 text-[12px] font-semibold border transition-colors flex items-center gap-1.5 ${
                      showStationEditor
                        ? "border-[#0f62fe] bg-[#0f62fe] text-[#ffffff]"
                        : "border-[#e0e0e0] bg-[#ffffff] text-[#0f62fe] hover:bg-[#f4f4f4]"
                    }`}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>{showStationEditor ? "Done Editing" : "Edit Station / Board"}</span>
                  </button>

                  <div className="bg-[#f4f4f4] border border-[#e0e0e0] px-3 py-2 flex items-center gap-1.5 text-[12px]">
                    <Clock className="w-3.5 h-3.5 text-[#0f62fe]" />
                    <span className="text-[#525252]">Review timer:</span>
                    <strong className="text-[#161616]">{elapsedDocSec}s</strong>
                  </div>
                </div>
              </div>

              {/* Collapsible Station & Board Metadata Editor */}
              {showStationEditor && (
                <div className="p-5 lg:px-8 bg-[#f4f4f4] border-b border-[#e0e0e0]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-[12px] text-[#525252] mb-1">
                        Board Serial / ID
                      </label>
                      <input
                        type="text"
                        value={boardId}
                        onChange={(e) => setBoardId(e.target.value)}
                        className="carbon-input w-full text-[14px] bg-[#ffffff]"
                        placeholder="BAT-PCBA-101"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] text-[#525252] mb-1">
                        Board Revision
                      </label>
                      <input
                        type="text"
                        value={boardRevision}
                        onChange={(e) => setBoardRevision(e.target.value)}
                        className="carbon-input w-full text-[14px] bg-[#ffffff]"
                        placeholder="A"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] text-[#525252] mb-1">
                        Production Line / Bench
                      </label>
                      <select
                        value={lineStation}
                        onChange={(e) => setLineStation(e.target.value)}
                        className="carbon-input w-full text-[14px] bg-[#ffffff]"
                      >
                        {(
                          config?.demo_lines || [
                            "Line-1-PostReflow",
                            "Line-2-FirstArticle",
                            "SMK-Lab-Bench-A",
                            "Rework-Cell-01",
                          ]
                        ).map((ln) => (
                          <option key={ln} value={ln}>
                            {formatLineStation(ln)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[12px] text-[#525252] mb-1">
                        Inspector Name
                      </label>
                      <select
                        value={operatorId}
                        onChange={(e) => {
                          setOperatorId(e.target.value);
                          setReviewerId(e.target.value);
                        }}
                        className="carbon-input w-full text-[14px] bg-[#ffffff]"
                      >
                        {(
                          config?.demo_operators || [
                            "OP-BTM-01 (Siti - Line 1)",
                            "OP-BTM-02 (Budi - Line 2)",
                            "OP-SMK-01 (Rizky - SMK Lab)",
                            "QA-LEAD-01 (Dewi - Senior QA)",
                          ]
                        ).map((op) => (
                          <option key={op} value={op}>
                            {formatOperatorName(op)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[12px] text-[#525252] mb-1">
                        Inspection Stage
                      </label>
                      <select
                        value={inspectionType}
                        onChange={(e) => setInspectionType(e.target.value)}
                        className="carbon-input w-full text-[14px] bg-[#ffffff]"
                      >
                        {(
                          config?.inspection_types || [
                            "post_reflow",
                            "first_article",
                            "rework_verification",
                            "smk_lab_training",
                          ]
                        ).map((tp) => (
                          <option key={tp} value={tp}>
                            {formatInspectionStage(tp)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Guided 3-Stage Stepper */}
              <div className="grid grid-cols-1 md:grid-cols-3 bg-[#f4f4f4] divide-y md:divide-y-0 md:divide-x divide-[#e0e0e0]">
                {[
                  {
                    step: 1,
                    title: "Step 1 · Select or Capture Board",
                    sub: "Pick a sample board, upload a photo, or use the bench camera",
                  },
                  {
                    step: 2,
                    title: "Step 2 · Review AI Findings",
                    sub: "Check highlighted issues and confirm or adjust each finding",
                  },
                  {
                    step: 3,
                    title: "Step 3 · Final Sign-Off",
                    sub: "Confirm Pass, Rework, Quarantine, or Escalate to save the record",
                  },
                ].map((item) => {
                  const isActive = currentStage === item.step;
                  const isDone = item.step < currentStage;
                  return (
                    <div
                      key={item.step}
                      className={`px-6 py-3.5 border-t-2 transition-colors ${
                        isActive
                          ? "border-[#0f62fe] bg-[#ffffff]"
                          : isDone
                          ? "border-[#24a148] bg-[#f4f4f4]"
                          : "border-transparent bg-[#f4f4f4]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[14px] font-semibold tracking-[0.16px] text-[#161616]">
                          {item.title}
                        </span>
                        {isDone && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#24a148]">
                            <Check className="w-4 h-4" /> Done
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#525252]">{item.sub}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Main 2-Column Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN (5 cols on lg): Unified Board Selection + Preview + 1-Click Run AI */}
              <div className="lg:col-span-5 space-y-6">
                <div className="border border-[#e0e0e0] bg-[#ffffff]">
                  <div className="px-6 py-4 bg-[#f4f4f4] border-b border-[#e0e0e0] flex items-center justify-between">
                    <div>
                      <span className="text-[12px] text-[#0f62fe] font-semibold block">
                        Board Image Input
                      </span>
                      <h2 className="text-[18px] font-semibold text-[#161616]">
                        Choose or capture a PCB to inspect
                      </h2>
                    </div>
                    <span className="text-[12px] bg-[#ffffff] border border-[#e0e0e0] px-2.5 py-1 text-[#161616]">
                      Board: <strong>{boardId}</strong>
                    </span>
                  </div>

                  {/* Input Source Tabs */}
                  <div className="grid grid-cols-3 border-b border-[#e0e0e0]">
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setCaptureMode("sample");
                      }}
                      className={`min-h-[46px] px-3 py-2 text-[13px] border-b-2 flex items-center justify-center gap-2 ${
                        captureMode === "sample"
                          ? "border-[#0f62fe] bg-[#ffffff] font-semibold text-[#161616]"
                          : "border-transparent bg-[#f4f4f4] text-[#525252] hover:text-[#161616]"
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                      <span>Sample Boards ({samples.length || 16})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setCaptureMode("upload");
                      }}
                      className={`min-h-[46px] px-3 py-2 text-[13px] border-b-2 flex items-center justify-center gap-2 ${
                        captureMode === "upload"
                          ? "border-[#0f62fe] bg-[#ffffff] font-semibold text-[#161616]"
                          : "border-transparent bg-[#f4f4f4] text-[#525252] hover:text-[#161616]"
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCaptureMode("camera");
                      }}
                      className={`min-h-[46px] px-3 py-2 text-[13px] border-b-2 flex items-center justify-center gap-2 ${
                        captureMode === "camera"
                          ? "border-[#0f62fe] bg-[#ffffff] font-semibold text-[#161616]"
                          : "border-transparent bg-[#f4f4f4] text-[#525252] hover:text-[#161616]"
                      }`}
                    >
                      <Camera className="w-4 h-4" />
                      <span>Bench Camera</span>
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Mode A: Sample Gallery with Human-Readable Cards */}
                    {captureMode === "sample" && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12px] text-[#525252]">Filter board type:</span>
                          <div className="flex flex-wrap gap-1">
                            {[
                              { id: "all", label: "All Boards (16)" },
                              { id: "smt", label: "SMT Assembly (4)" },
                              { id: "pku", label: "Copper / Trace (10)" },
                              { id: "golden", label: "Clean Reference (2)" },
                            ].map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() =>
                                  setSampleFilter(f.id as "all" | "smt" | "pku" | "golden")
                                }
                                className={`px-2.5 py-1 text-[12px] border transition-colors ${
                                  sampleFilter === f.id
                                    ? "border-[#0f62fe] bg-[#0f62fe] text-[#ffffff] font-semibold"
                                    : "border-[#e0e0e0] bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]"
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[230px] overflow-y-auto p-1.5 border border-[#e0e0e0] bg-[#f4f4f4]">
                          {filteredSamples.map((smp) => {
                            const selected = smp.id === selectedSample?.id;
                            return (
                              <button
                                key={smp.id}
                                type="button"
                                onClick={() => handleSelectSample(smp)}
                                className={`text-left border p-1.5 transition-colors flex flex-col justify-between ${
                                  selected
                                    ? "border-2 border-[#0f62fe] bg-[#ffffff]"
                                    : "border-[#e0e0e0] bg-[#ffffff] hover:bg-[#f4f4f4]"
                                }`}
                              >
                                <div className="relative aspect-[4/3] w-full bg-[#161616] overflow-hidden mb-1.5">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={smp.image_url}
                                    alt={smp.title}
                                    className="w-full h-full object-cover"
                                  />
                                  {smp.is_golden && (
                                    <span className="absolute top-1 left-1 bg-[#24a148] text-[#ffffff] text-[10px] px-1.5 py-0.5 font-semibold">
                                      CLEAN REF
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[12px] font-semibold text-[#161616] truncate">
                                    {smp.title.replace(/_/g, " ")}
                                  </p>
                                  <p className="text-[11px] text-[#525252] truncate">
                                    {smp.is_golden
                                      ? "Pass Reference"
                                      : formatDefectClass(smp.expected_defect_class)}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Mode B: File Upload */}
                    {captureMode === "upload" && (
                      <div className="border border-dashed border-[#161616] bg-[#f4f4f4] p-6 text-center space-y-3">
                        <Upload className="w-8 h-8 text-[#0f62fe] mx-auto" />
                        <div>
                          <p className="text-[14px] font-semibold text-[#161616]">
                            Upload a PCB photograph from your device
                          </p>
                          <p className="text-[12px] text-[#525252]">
                            Supports JPEG, PNG, or WebP photos. Please do not upload confidential customer boards.
                          </p>
                        </div>
                        <label className="carbon-btn-primary inline-flex items-center gap-2 cursor-pointer">
                          <Upload className="w-4 h-4" />
                          <span>Choose Board Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}

                    {/* Mode C: Camera Capture */}
                    {captureMode === "camera" && (
                      <div className="border border-[#e0e0e0] bg-[#f4f4f4] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[14px] font-semibold text-[#161616]">
                            Bench or Tablet Camera
                          </span>
                          <div className="flex gap-2">
                            {!cameraActive ? (
                              <button
                                type="button"
                                onClick={startCamera}
                                className="carbon-btn-primary flex items-center gap-2"
                              >
                                <Camera className="w-4 h-4" />
                                <span>Start Camera</span>
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={captureSnapshotFromVideo}
                                  className="carbon-btn-primary flex items-center gap-2"
                                >
                                  <Camera className="w-4 h-4" />
                                  <span>Take Photo</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={stopCamera}
                                  className="carbon-btn-secondary"
                                >
                                  Stop
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {cameraError && (
                          <div className="p-3 bg-[#ffffff] border-l-4 border-[#f1c21b] text-[12px] text-[#161616]">
                            {cameraError}
                          </div>
                        )}

                        <div className="bg-[#161616] aspect-video w-full flex items-center justify-center overflow-hidden">
                          <video
                            ref={videoRef}
                            playsInline
                            muted
                            className={`w-full h-full object-contain ${
                              cameraActive ? "block" : "hidden"
                            }`}
                          />
                          {!cameraActive && (
                            <div className="text-center p-4 text-[#c6c6c6] text-[12px] space-y-2">
                              <p>Camera preview is currently off.</p>
                              <label className="carbon-btn-tertiary inline-flex items-center gap-2 cursor-pointer">
                                <Camera className="w-4 h-4" />
                                <span>Open Mobile Camera / Photo Picker</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={handleFileUpload}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Active PCB Image Preview */}
                    {activeImageUrl && (
                      <div className="border border-[#e0e0e0] bg-[#161616]">
                        <div className="px-3.5 py-2 bg-[#262626] text-[#ffffff] text-[12px] flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold truncate">
                            {captureMode === "sample" && selectedSample
                              ? selectedSample.title.replace(/_/g, " ")
                              : uploadedFileName || "Captured Board Photo"}
                          </span>
                          {captureMode === "sample" &&
                            selectedSample?.bboxes &&
                            selectedSample.bboxes.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowGroundTruthBoxes((v) => !v)}
                                className={`px-2.5 py-0.5 text-[11px] border transition-colors flex items-center gap-1.5 ${
                                  showGroundTruthBoxes
                                    ? "border-[#f1c21b] bg-[#f1c21b] text-[#161616] font-semibold"
                                    : "border-[#8c8c8c] text-[#c6c6c6] hover:text-[#ffffff]"
                                }`}
                              >
                                <Eye className="w-3 h-3" />
                                <span>
                                  {showGroundTruthBoxes
                                    ? "Hide Defect Highlights"
                                    : `Highlight Defect Area (${selectedSample.bboxes.length})`}
                                </span>
                              </button>
                            )}
                        </div>

                        <div className="relative w-full max-h-[340px] flex items-center justify-center overflow-hidden bg-[#161616]">
                          <div className="relative inline-block w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={activeImageUrl}
                              alt="Selected PCB for visual inspection"
                              className="w-full max-h-[320px] object-contain mx-auto block"
                            />
                            {showGroundTruthBoxes &&
                              captureMode === "sample" &&
                              selectedSample?.bboxes?.map((box, i) => {
                                const [x1, y1, x2, y2] = box.bbox_norm;
                                return (
                                  <div
                                    key={i}
                                    style={{
                                      left: `${x1 * 100}%`,
                                      top: `${y1 * 100}%`,
                                      width: `${Math.max(2, (x2 - x1) * 100)}%`,
                                      height: `${Math.max(2, (y2 - y1) * 100)}%`,
                                    }}
                                    className="absolute border-2 border-[#f1c21b] bg-[#f1c21b]/15 pointer-events-none"
                                  >
                                    <span className="bg-[#f1c21b] text-[#161616] text-[10px] font-semibold px-1.5 py-0.5 absolute -top-5 left-0 whitespace-nowrap">
                                      {formatOrigSubcategory(box.orig_label)} ({box.quadrant})
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>

                        {captureMode === "sample" && selectedSample && (
                          <div className="p-3 bg-[#f4f4f4] border-t border-[#e0e0e0] text-[12px] text-[#525252] flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {selectedSample.is_golden
                                ? "Defect-free reference board used to verify pass criteria."
                                : `Sample board illustrating: ${formatDefectClass(
                                    selectedSample.expected_defect_class
                                  )} (${selectedSample.location_hint}).`}
                            </span>
                            <span className="bg-[#ffffff] border border-[#e0e0e0] px-2 py-0.5 text-[#161616] font-semibold">
                              {selectedSample.is_golden
                                ? "Clean Reference"
                                : formatDefectClass(selectedSample.expected_defect_class)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error Notice */}
                    {analyzeError && (
                      <div className="p-3 bg-[#f4f4f4] border-l-4 border-[#da1e28] text-[13px] text-[#161616]">
                        <strong className="font-semibold text-[#da1e28]">Unable to run check: </strong>
                        {analyzeError}
                      </div>
                    )}

                    {/* Primary 1-Click Action Buttons Right Under the Board Preview */}
                    <div className="pt-1 flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => handleAnalyze(false)}
                        className="carbon-btn-primary flex-1 flex items-center justify-center gap-2 font-semibold"
                      >
                        {isAnalyzing ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>
                              Checking board with AI ({(analyzeElapsedMs / 1000).toFixed(1)}s)...
                            </span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Run AI Visual Check</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => handleAnalyze(true)}
                        className="carbon-btn-secondary flex items-center justify-center gap-2"
                        title="Skip AI check and record inspection findings manually"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>Log Manually</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN (7 cols on lg): Human-Readable Findings Review & Sign-Off */}
              <div className="lg:col-span-7 space-y-6">
                {!currentRecord ? (
                  <div className="border border-[#e0e0e0] bg-[#f4f4f4] p-8 lg:p-10 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e0e0e0] pb-6">
                      <div className="space-y-1.5">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.32px] text-[#0f62fe]">
                          Ready for Inspection
                        </span>
                        <h3 className="text-[24px] font-light text-[#161616]">
                          Click &ldquo;Run AI Visual Check&rdquo; to inspect this board
                        </h3>
                        <p className="text-[14px] text-[#525252] max-w-xl">
                          The AI assistant scans the board photo for visible component and solder issues, explains what it sees in plain language, and prepares a quality record for your sign-off.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => handleAnalyze(false)}
                        className="carbon-btn-primary shrink-0 flex items-center gap-2 font-semibold"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Run AI Visual Check</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-[14px] font-semibold text-[#161616]">
                        What the AI Visual Check looks for (6 visible defect types):
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-[13px]">
                        {(Object.keys(DEFECT_LABELS) as DefectClass[]).map((cls) => (
                          <div
                            key={cls}
                            className="p-3.5 bg-[#ffffff] border border-[#e0e0e0] space-y-1"
                          >
                            <span className="font-semibold text-[#0f62fe] block">
                              {DEFECT_LABELS[cls]}
                            </span>
                            <p className="text-[12px] text-[#525252] leading-[1.4]">
                              {DEFECT_DESCRIPTIONS[cls]}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* REVIEW & FINDINGS CARD */}
                    <div className="border border-[#e0e0e0] bg-[#ffffff]">
                      {/* Clear Plain-English Status Banner */}
                      {currentRecord.status === "confirmed" ||
                      currentRecord.status === "escalated" ? (
                        <div
                          className={`px-6 py-4 border-b border-[#e0e0e0] flex flex-wrap items-center justify-between gap-3 ${
                            currentRecord.status === "confirmed"
                              ? "bg-[#24a148] text-[#ffffff]"
                              : "bg-[#f1c21b] text-[#161616]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-6 h-6 shrink-0" />
                            <div>
                              <span className="text-[12px] font-semibold uppercase tracking-[0.32px] block">
                                Inspection Signed Off &amp; Saved
                              </span>
                              <h2 className="text-[20px] font-semibold">
                                Final Decision:{" "}
                                {formatDispositionLabel(currentRecord.final_disposition)}
                              </h2>
                            </div>
                          </div>
                          <div className="text-right text-[12px]">
                            <div className="font-semibold">
                              Reviewed by {formatOperatorName(currentRecord.reviewer_id)}
                            </div>
                            <div>{formatAgreementLabel(currentRecord.human_agreement)}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="px-6 py-4 bg-[#f1c21b] text-[#161616] border-b border-[#e0e0e0] flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <ShieldAlert className="w-6 h-6 shrink-0" />
                            <div>
                              <span className="text-[12px] font-semibold uppercase tracking-[0.32px] block">
                                AI Suggestion · Waiting for Your Sign-Off
                              </span>
                              <h2 className="text-[18px] font-semibold">
                                {defectReviews.length === 0
                                  ? "No visible issues found — Recommended: Pass"
                                  : `AI flagged ${defectReviews.length} potential ${
                                      defectReviews.length === 1 ? "issue" : "issues"
                                    } — Recommended: ${formatDispositionLabel(
                                      currentRecord.ai_result?.overall_disposition
                                    )}`}
                              </h2>
                            </div>
                          </div>
                          <span className="bg-[#161616] text-[#ffffff] px-3 py-1 text-[12px] font-semibold">
                            {formatAiSourceLabel(
                              currentRecord.ai_source,
                              currentRecord.ai_latency_ms
                            )}
                          </span>
                        </div>
                      )}

                      {/* Natural Summary Strip */}
                      <div className="px-6 py-3.5 bg-[#f4f4f4] border-b border-[#e0e0e0] grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                        <div>
                          <span className="text-[12px] text-[#525252] block">Board Inspected</span>
                          <strong className="text-[#161616]">
                            {currentRecord.board_id} (Rev {currentRecord.board_revision})
                          </strong>
                        </div>
                        <div>
                          <span className="text-[12px] text-[#525252] block">Photo Clarity</span>
                          <strong
                            className={`capitalize ${
                              currentRecord.ai_result?.image_quality === "acceptable"
                                ? "text-[#24a148]"
                                : "text-[#da1e28]"
                            }`}
                          >
                            {currentRecord.ai_result?.image_quality === "acceptable"
                              ? "Clear & Acceptable"
                              : currentRecord.ai_result?.image_quality || "Manual Check"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[12px] text-[#525252] block">Issues Flagged</span>
                          <strong className="text-[#161616]">
                            {defectReviews.length === 0
                              ? "None (Clean)"
                              : `${defectReviews.length} ${
                                  defectReviews.length === 1 ? "issue" : "issues"
                                }`}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[12px] text-[#525252] block">
                            Suggested Outcome
                          </span>
                          <strong className="text-[#0f62fe]">
                            {formatDispositionLabel(currentRecord.ai_result?.overall_disposition)}
                          </strong>
                        </div>
                      </div>

                      <div className="p-6 space-y-5">
                        {/* Plain-English Summary Note & Detected Board Markings */}
                        {currentRecord.ai_result && (
                          <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3 text-[13px]">
                            <div>
                              <span className="text-[12px] font-semibold text-[#525252] block mb-0.5">
                                AI Visual Summary:
                              </span>
                              <p className="text-[#161616] leading-[1.5]">
                                {currentRecord.ai_result.notes ||
                                  "Visual scan completed. Please review the findings below."}
                              </p>
                            </div>

                            {currentRecord.ai_result.visible_labels?.length > 0 && (
                              <div className="pt-2 border-t border-[#e0e0e0] flex flex-wrap items-center gap-2">
                                <span className="text-[12px] text-[#525252]">
                                  Component labels read on board:
                                </span>
                                {currentRecord.ai_result.visible_labels.map((lbl, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[12px] font-semibold bg-[#ffffff] border border-[#e0e0e0] px-2 py-0.5 text-[#161616]"
                                  >
                                    {lbl}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Safety Attention Notices (only if any) */}
                        {(currentRecord.routing_reasons?.length > 0 ||
                          currentRecord.ai_errors?.length > 0) && (
                          <div className="p-3.5 bg-[#f4f4f4] border-l-4 border-[#0f62fe] space-y-1 text-[13px]">
                            <p className="font-semibold text-[#161616]">
                              Why closer human inspection is recommended:
                            </p>
                            {currentRecord.routing_reasons?.map((reason, i) => (
                              <p key={`r-${i}`} className="text-[#525252]">
                                • {reason}
                              </p>
                            ))}
                            {currentRecord.ai_errors?.map((err, i) => (
                              <p key={`e-${i}`} className="text-[#da1e28] text-[12px]">
                                • {err}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Per-Defect Findings List */}
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-[18px] font-normal text-[#161616]">
                              Inspection Findings ({defectReviews.length})
                            </h3>
                            {currentRecord.status !== "confirmed" &&
                              currentRecord.status !== "escalated" && (
                                <button
                                  type="button"
                                  onClick={addHumanDefect}
                                  className="carbon-btn-tertiary !min-h-[38px] !py-1.5 !px-3 text-[13px] flex items-center gap-1.5"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>Report Another Issue</span>
                                </button>
                              )}
                          </div>

                          {defectReviews.length === 0 ? (
                            <div className="p-6 border border-[#e0e0e0] bg-[#f4f4f4] text-center space-y-2">
                              <CheckCircle2 className="w-8 h-8 text-[#24a148] mx-auto" />
                              <p className="text-[16px] font-semibold text-[#161616]">
                                No visible defects detected on this board
                              </p>
                              <p className="text-[13px] text-[#525252] max-w-lg mx-auto">
                                Check the board photo to confirm all components and solder joints look clean. If you spot an issue the AI missed, click{" "}
                                <strong>Report Another Issue</strong> above.
                              </p>
                            </div>
                          ) : (
                            defectReviews.map((rev, idx) => {
                              const aiDefect =
                                rev.ai_index !== null &&
                                currentRecord.ai_result?.defects?.[rev.ai_index]
                                  ? currentRecord.ai_result.defects[rev.ai_index]
                                  : null;
                              const confPct = aiDefect ? Math.round(aiDefect.confidence * 100) : 100;
                              const isLowConf =
                                aiDefect &&
                                aiDefect.confidence < (config?.confidence_threshold ?? 0.6);
                              const isLocked =
                                currentRecord.status === "confirmed" ||
                                currentRecord.status === "escalated";

                              return (
                                <div
                                  key={idx}
                                  className="border border-[#e0e0e0] bg-[#ffffff] p-5 space-y-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e0e0e0] pb-3">
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="bg-[#161616] text-[#ffffff] text-[11px] font-semibold px-2 py-0.5">
                                          {aiDefect ? `Finding #${idx + 1}` : `Added by Inspector`}
                                        </span>
                                        <span className="text-[17px] font-semibold text-[#161616]">
                                          {formatDefectClass(rev.defect_class)}
                                        </span>
                                        <span
                                          className={`text-[11px] px-2 py-0.5 font-semibold ${
                                            rev.severity === "high"
                                              ? "bg-[#da1e28] text-[#ffffff]"
                                              : rev.severity === "medium"
                                              ? "bg-[#f1c21b] text-[#161616]"
                                              : "bg-[#e0e0e0] text-[#161616]"
                                          }`}
                                        >
                                          {SEVERITY_LABELS[rev.severity] || rev.severity}
                                        </span>
                                      </div>
                                      <p className="text-[13px] text-[#525252]">
                                        <strong className="text-[#161616]">Where on board: </strong>
                                        {rev.location_hint}
                                      </p>
                                    </div>

                                    {/* Friendly Confidence Pill & Bar */}
                                    {aiDefect && (
                                      <div className="min-w-[175px] text-right">
                                        <div className="flex items-center justify-between text-[12px] mb-1">
                                          <span className="text-[#525252]">AI Certainty</span>
                                          <strong
                                            className={
                                              isLowConf ? "text-[#da1e28]" : "text-[#161616]"
                                            }
                                          >
                                            {confPct}%{" "}
                                            {isLowConf ? "(Needs Closer Look)" : "(High Match)"}
                                          </strong>
                                        </div>
                                        <div className="w-full h-2 bg-[#e0e0e0]">
                                          <div
                                            style={{ width: `${confPct}%` }}
                                            className={`h-full ${
                                              isLowConf ? "bg-[#da1e28]" : "bg-[#0f62fe]"
                                            }`}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* What the AI Saw & Suggested Action */}
                                  {aiDefect && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px] bg-[#f4f4f4] p-3.5 border border-[#e0e0e0]">
                                      <div>
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.32px] text-[#525252] block mb-1">
                                          What the AI Saw
                                        </span>
                                        <p className="text-[#161616] leading-[1.45]">
                                          {aiDefect.evidence}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.32px] text-[#525252] block mb-1">
                                          Suggested Next Step
                                        </span>
                                        <p className="text-[#161616] leading-[1.45]">
                                          {aiDefect.recommended_action}
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Friendly Inspector Decision Controls */}
                                  {!isLocked && (
                                    <div className="space-y-3 pt-1">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-[12px] font-semibold text-[#161616]">
                                          Your decision on this finding:
                                        </span>
                                        {aiDefect === null && (
                                          <button
                                            type="button"
                                            onClick={() => removeHumanDefect(idx)}
                                            className="text-[12px] text-[#da1e28] flex items-center gap-1 hover:underline"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Remove issue</span>
                                          </button>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {(
                                          [
                                            {
                                              act: "accept",
                                              label: "Confirm Issue",
                                              activeBg:
                                                "bg-[#24a148] text-[#ffffff] border-[#24a148]",
                                            },
                                            {
                                              act: "edit",
                                              label: "Edit Details",
                                              activeBg:
                                                "bg-[#0f62fe] text-[#ffffff] border-[#0f62fe]",
                                            },
                                            {
                                              act: "reject",
                                              label: "Dismiss (False Alarm)",
                                              activeBg:
                                                "bg-[#da1e28] text-[#ffffff] border-[#da1e28]",
                                            },
                                            {
                                              act: "escalate",
                                              label: "Ask Senior QA",
                                              activeBg:
                                                "bg-[#f1c21b] text-[#161616] border-[#f1c21b]",
                                            },
                                          ] as const
                                        ).map((btn) => {
                                          const active = rev.action === btn.act;
                                          return (
                                            <button
                                              key={btn.act}
                                              type="button"
                                              onClick={() =>
                                                updateDefectReview(idx, { action: btn.act })
                                              }
                                              className={`min-h-[42px] px-3 py-2 text-[13px] font-semibold border transition-colors ${
                                                active
                                                  ? btn.activeBg
                                                  : "bg-[#f4f4f4] text-[#161616] border-[#e0e0e0] hover:bg-[#e0e0e0]"
                                              }`}
                                            >
                                              {btn.label}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      {/* Inline editors when 'edit' or human-added */}
                                      {(rev.action === "edit" || rev.ai_index === null) && (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                                          <div>
                                            <label className="block text-[12px] text-[#525252] mb-1">
                                              Issue Type
                                            </label>
                                            <select
                                              value={rev.defect_class}
                                              onChange={(e) =>
                                                updateDefectReview(idx, {
                                                  defect_class: e.target.value as DefectClass,
                                                })
                                              }
                                              className="carbon-input w-full text-[13px] bg-[#ffffff]"
                                            >
                                              {Object.entries(DEFECT_LABELS).map(([k, v]) => (
                                                <option key={k} value={k}>
                                                  {v}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="block text-[12px] text-[#525252] mb-1">
                                              Priority / Severity
                                            </label>
                                            <select
                                              value={rev.severity}
                                              onChange={(e) =>
                                                updateDefectReview(idx, {
                                                  severity: e.target.value as Severity,
                                                })
                                              }
                                              className="carbon-input w-full text-[13px] bg-[#ffffff]"
                                            >
                                              <option value="low">Low Priority</option>
                                              <option value="medium">Medium Priority</option>
                                              <option value="high">High Priority</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label className="block text-[12px] text-[#525252] mb-1">
                                              Location on Board
                                            </label>
                                            <input
                                              type="text"
                                              value={rev.location_hint}
                                              onChange={(e) =>
                                                updateDefectReview(idx, {
                                                  location_hint: e.target.value,
                                                })
                                              }
                                              className="carbon-input w-full text-[13px] bg-[#ffffff]"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Collapsible Technical & Audit Details Accordion (Progressive Disclosure) */}
                        <div className="border-t border-[#e0e0e0] pt-3">
                          <button
                            type="button"
                            onClick={() => setShowTechDetails((v) => !v)}
                            className="text-[13px] text-[#525252] hover:text-[#0f62fe] flex items-center gap-1.5"
                          >
                            {showTechDetails ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            <span>
                              {showTechDetails
                                ? "Hide technical & audit details"
                                : "Show technical & audit details (Model ID, SHA-256 hash, raw JSON)"}
                            </span>
                          </button>

                          {showTechDetails && (
                            <div className="mt-3 p-4 bg-[#f4f4f4] border border-[#e0e0e0] space-y-3 text-[12px]">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                  <span className="text-[#525252] block">Record ID</span>
                                  <strong className="font-mono text-[#161616]">
                                    {currentRecord.id}
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-[#525252] block">AI Model</span>
                                  <strong className="font-mono text-[#161616]">
                                    {currentRecord.model_id}
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-[#525252] block">Prompt Version</span>
                                  <strong className="font-mono text-[#161616]">
                                    {currentRecord.prompt_version} ({currentRecord.prompt_sha})
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-[#525252] block">Response Time</span>
                                  <strong className="font-mono text-[#161616]">
                                    {currentRecord.ai_latency_ms} ms ({currentRecord.ai_attempts}{" "}
                                    attempt)
                                  </strong>
                                </div>
                              </div>

                              <div>
                                <button
                                  type="button"
                                  onClick={() => setShowRawJson((v) => !v)}
                                  className="text-[12px] font-mono text-[#0f62fe] hover:underline flex items-center gap-1"
                                >
                                  {showRawJson ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {showRawJson ? "Hide raw JSON output" : "View raw JSON output"}
                                  </span>
                                </button>
                                {showRawJson && (
                                  <pre className="mt-2 p-3 bg-[#161616] text-[#f4f4f4] font-mono text-[11px] overflow-x-auto max-h-[240px]">
                                    {JSON.stringify(currentRecord.ai_result, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* FINAL SIGN-OFF CARD */}
                    {currentRecord.status !== "confirmed" &&
                    currentRecord.status !== "escalated" ? (
                      <div className="border border-[#e0e0e0] bg-[#ffffff]">
                        <div className="px-6 py-4 bg-[#f4f4f4] border-b border-[#e0e0e0]">
                          <span className="text-[12px] font-semibold text-[#0f62fe] block">
                            Step 3 of 3 · Inspector Sign-Off
                          </span>
                          <h2 className="text-[20px] font-normal text-[#161616]">
                            Confirm final board decision
                          </h2>
                        </div>

                        <div className="p-6 space-y-5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(
                              ["pass", "rework", "quarantine", "escalate"] as FinalDisposition[]
                            ).map((disp) => {
                              const info = DISPOSITION_INFO[disp];
                              const active = finalDisposition === disp;
                              return (
                                <button
                                  key={disp}
                                  type="button"
                                  onClick={() => setFinalDisposition(disp)}
                                  className={`p-4 text-left border-2 transition-colors ${
                                    active
                                      ? `${info.borderColor} ${info.bgColor} ${info.textColor}`
                                      : "border-[#e0e0e0] bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[15px] font-semibold">{info.label}</span>
                                    {active && <Check className="w-4 h-4 shrink-0" />}
                                  </div>
                                  <p
                                    className={`text-[12px] ${
                                      active ? "opacity-90" : "text-[#525252]"
                                    }`}
                                  >
                                    {info.desc}
                                  </p>
                                </button>
                              );
                            })}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[12px] text-[#525252] mb-1">
                                Signed Off By (Inspector / QA)
                              </label>
                              <select
                                value={reviewerId}
                                onChange={(e) => setReviewerId(e.target.value)}
                                className="carbon-input w-full text-[14px]"
                              >
                                {(
                                  config?.demo_operators || [
                                    "OP-BTM-01 (Siti - Line 1)",
                                    "OP-BTM-02 (Budi - Line 2)",
                                    "OP-SMK-01 (Rizky - SMK Lab)",
                                    "QA-LEAD-01 (Dewi - Senior QA)",
                                  ]
                                ).map((op) => (
                                  <option key={op} value={op}>
                                    {formatOperatorName(op)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[12px] text-[#525252] mb-1">
                                Inspector Notes (Optional)
                              </label>
                              <input
                                type="text"
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                className="carbon-input w-full text-[14px]"
                                placeholder="e.g., Confirmed solder bridge on U2; sent to touch-up"
                              />
                            </div>
                          </div>

                          {reviewError && (
                            <div className="p-3 bg-[#f4f4f4] border-l-4 border-[#da1e28] text-[13px] text-[#da1e28] font-semibold">
                              {reviewError}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                            <span className="text-[12px] text-[#525252]">
                              Saves both the AI suggestion and your final decision to the quality log.
                            </span>
                            <button
                              type="button"
                              disabled={isSavingReview}
                              onClick={handleConfirmReview}
                              className="carbon-btn-primary font-semibold flex items-center gap-2"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>
                                {isSavingReview
                                  ? "Saving quality record..."
                                  : "Confirm & Complete Inspection"}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* POST-CONFIRMATION SUMMARY CARD */
                      <div className="border-2 border-[#24a148] bg-[#f4f4f4] p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <h3 className="text-[20px] font-semibold text-[#161616]">
                              Inspection saved to Quality Log
                            </h3>
                            <p className="text-[14px] text-[#525252]">
                              Signed off by{" "}
                              <strong className="text-[#161616]">
                                {formatOperatorName(currentRecord.reviewer_id)}
                              </strong>{" "}
                              in <strong>{currentRecord.doc_time_s ?? elapsedDocSec}s</strong> ·{" "}
                              <strong className="text-[#161616]">
                                {formatAgreementLabel(currentRecord.human_agreement)}
                              </strong>
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleStartNewInspection}
                              className="carbon-btn-primary flex items-center gap-2 font-semibold"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Inspect Next Board</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRecordDetail(currentRecord);
                                setActiveTab("records");
                              }}
                              className="carbon-btn-secondary flex items-center gap-2"
                            >
                              <Database className="w-4 h-4" />
                              <span>View in Quality Log</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: QUALITY LOG & SUMMARY DRAWER (HUMAN-READABLE)                */}
        {/* =================================================================== */}
        {activeTab === "records" && (
          <div className="space-y-6">
            <div className="border border-[#e0e0e0] bg-[#ffffff] p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[13px] text-[#0f62fe] mb-1">
                   Traceable Board Inspection History · Batam SMT &amp; SMK Lab Log
                </p>
                <h1 className="text-[28px] lg:text-[32px] font-light text-[#161616]">
                  Quality Inspection Log ({filteredRecords.length})
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center border border-[#e0e0e0] bg-[#f4f4f4]">
                  <Filter className="w-4 h-4 text-[#525252] ml-3 mr-1" />
                  {[
                    { id: "all", label: "All Records" },
                    { id: "pending_review", label: "Needs Review" },
                    { id: "confirmed", label: "Verified" },
                    { id: "escalated", label: "Escalated to QA" },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setRecordStatusFilter(st.id)}
                      className={`min-h-[40px] px-3 py-1.5 text-[12px] transition-colors ${
                        recordStatusFilter === st.id
                          ? "bg-[#0f62fe] text-[#ffffff] font-semibold"
                          : "text-[#161616] hover:bg-[#e0e0e0]"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <a
                  href="/api/export/csv"
                  className="carbon-btn-primary !min-h-[40px] !py-2 flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Spreadsheet (CSV)</span>
                </a>
                <a
                  href="/api/export/json"
                  className="carbon-btn-secondary !min-h-[40px] !py-2 flex items-center gap-1.5"
                >
                  <FileJson className="w-4 h-4" />
                  <span>Download Audit JSON</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Human-Readable Quality Log Table */}
              <div
                className={`${
                  selectedRecordDetail ? "lg:col-span-7" : "lg:col-span-12"
                } border border-[#e0e0e0] bg-[#ffffff] overflow-x-auto`}
              >
                {filteredRecords.length === 0 ? (
                  <div className="p-12 text-center text-[#525252] space-y-3">
                    <p className="text-[16px] text-[#161616]">
                      No inspection records match the selected filter.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("inspect")}
                      className="carbon-btn-primary"
                    >
                      Go to Inspector Station
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#525252] text-[12px]">
                        <th className="p-3.5 font-semibold">Time &amp; Shift</th>
                        <th className="p-3.5 font-semibold">Board &amp; Station</th>
                        <th className="p-3.5 font-semibold">Inspection Findings</th>
                        <th className="p-3.5 font-semibold">Final Decision</th>
                        <th className="p-3.5 font-semibold">Inspector &amp; Review</th>
                        <th className="p-3.5 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e0e0e0]">
                      {filteredRecords.map((rec) => {
                        const isSelected = selectedRecordDetail?.id === rec.id;
                        const dt = formatFriendlyDateTime(rec.created_at);
                        const statusBadge = formatStatusBadge(rec.status);
                        const dispInfo =
                          rec.final_disposition && rec.final_disposition in DISPOSITION_INFO
                            ? DISPOSITION_INFO[rec.final_disposition]
                            : null;

                        return (
                          <tr
                            key={rec.id}
                            onClick={() => {
                              setSelectedRecordDetail(rec);
                              setShowDrawerTechAudit(false);
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? "bg-[#f4f4f4]" : "hover:bg-[#f4f4f4]"
                            }`}
                          >
                            <td className="p-3.5 text-[#161616]">
                              <div className="font-semibold">{dt.time}</div>
                              <div className="text-[11px] text-[#525252]">
                                {dt.date} · {rec.shift}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <div className="font-semibold text-[#161616]">
                                {rec.board_id} (Rev {rec.board_revision})
                              </div>
                              <div className="text-[12px] text-[#525252]">
                                {formatLineStation(rec.line_station)}
                              </div>
                            </td>
                            <td className="p-3.5 text-[#161616]">
                              <div className="font-semibold">{summarizeRecordFindings(rec)}</div>
                              <div className="text-[11px] text-[#525252]">
                                {formatInspectionStage(rec.inspection_type)}
                              </div>
                            </td>
                            <td className="p-3.5">
                              {dispInfo ? (
                                <span
                                  className={`inline-block px-2.5 py-0.5 text-[12px] font-semibold ${dispInfo.badgeBg} ${dispInfo.badgeText}`}
                                >
                                  {dispInfo.shortLabel}
                                </span>
                              ) : (
                                <span
                                  className={`inline-block px-2.5 py-0.5 text-[12px] font-semibold ${statusBadge.bg} ${statusBadge.text}`}
                                >
                                  {statusBadge.label}
                                </span>
                              )}
                            </td>
                            <td className="p-3.5">
                              <div className="text-[#161616] font-semibold">
                                {formatOperatorName(rec.reviewer_id || rec.operator_id)}
                              </div>
                              <div className="text-[11px] text-[#525252]">
                                {formatAgreementLabel(rec.human_agreement)}
                              </div>
                            </td>
                            <td className="p-3.5">
                              {rec.status === "pending_review" ||
                              rec.status === "manual_required" ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    initializeReviewFromRecord(rec);
                                    setActiveTab("inspect");
                                  }}
                                  className="px-3 py-1.5 bg-[#0f62fe] text-[#ffffff] text-[12px] font-semibold hover:bg-[#0050e6]"
                                >
                                  Review Now
                                </button>
                              ) : (
                                <span className="text-[12px] font-semibold text-[#0f62fe] hover:underline">
                                  View Summary
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Human-Readable Record Summary Drawer */}
              {selectedRecordDetail && (
                <div className="lg:col-span-5 border border-[#e0e0e0] bg-[#ffffff] p-6 space-y-5">
                  <div className="flex items-start justify-between border-b border-[#e0e0e0] pb-3">
                    <div>
                      <span className="text-[12px] font-semibold text-[#0f62fe] block">
                        Inspection Summary
                      </span>
                      <h3 className="text-[20px] font-semibold text-[#161616]">
                        Board {selectedRecordDetail.board_id} (Rev{" "}
                        {selectedRecordDetail.board_revision})
                      </h3>
                      <p className="text-[12px] text-[#525252]">
                        {formatLineStation(selectedRecordDetail.line_station)} ·{" "}
                        {formatInspectionStage(selectedRecordDetail.inspection_type)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRecordDetail(null)}
                      className="text-[#525252] hover:text-[#161616]"
                      title="Close summary"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  {selectedRecordDetail.image_filename &&
                    selectedRecordDetail.image_filename.startsWith("/samples/") && (
                      <div className="bg-[#161616] p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedRecordDetail.image_filename}
                          alt={selectedRecordDetail.board_id}
                          className="w-full max-h-[210px] object-contain mx-auto"
                        />
                      </div>
                    )}

                  {/* AI Suggestion vs. Operator Decision Comparison */}
                  <div className="space-y-2 text-[13px]">
                    <h4 className="font-semibold text-[#161616]">
                      AI Suggestion vs. Final Inspector Decision
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 border border-[#e0e0e0] bg-[#f4f4f4]">
                        <span className="text-[11px] font-semibold uppercase text-[#525252] block">
                          Initial AI Suggestion
                        </span>
                        <p className="font-semibold text-[#0f62fe] text-[15px] mt-1">
                          {formatDispositionLabel(
                            selectedRecordDetail.original_ai_disposition ||
                              selectedRecordDetail.ai_result?.overall_disposition
                          )}
                        </p>
                        <p className="text-[12px] text-[#525252] mt-1">
                          Flagged issues: {selectedRecordDetail.ai_result?.defects?.length || 0}
                        </p>
                      </div>
                      <div className="p-3.5 border border-[#e0e0e0] bg-[#f4f4f4]">
                        <span className="text-[11px] font-semibold uppercase text-[#525252] block">
                          Final Inspector Decision
                        </span>
                        <p className="font-semibold text-[#24a148] text-[15px] mt-1">
                          {formatDispositionLabel(selectedRecordDetail.final_disposition)}
                        </p>
                        <p className="text-[12px] text-[#525252] mt-1">
                          Confirmed issues: {selectedRecordDetail.final_defects?.length ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Confirmed Findings List */}
                  {selectedRecordDetail.final_defects &&
                    selectedRecordDetail.final_defects.length > 0 && (
                      <div className="space-y-2 text-[13px]">
                        <h4 className="font-semibold text-[#161616]">Confirmed Issues on Board</h4>
                        <div className="space-y-2">
                          {selectedRecordDetail.final_defects.map((fd, i) => (
                            <div
                              key={i}
                              className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] flex items-start justify-between gap-2"
                            >
                              <div>
                                <strong className="text-[#161616] block">
                                  {formatDefectClass(fd.defect_class)}
                                </strong>
                                <span className="text-[12px] text-[#525252]">
                                  Location: {fd.location_hint}
                                </span>
                              </div>
                              <span className="text-[11px] font-semibold px-2 py-0.5 bg-[#ffffff] border border-[#e0e0e0]">
                                {SEVERITY_LABELS[fd.severity as Severity] || fd.severity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Inspector Details */}
                  <div className="grid grid-cols-2 gap-3 text-[12px] bg-[#f4f4f4] p-4 border border-[#e0e0e0]">
                    <div>
                      <span className="text-[#525252] block">Station Operator</span>
                      <strong className="text-[#161616]">
                        {formatOperatorName(selectedRecordDetail.operator_id)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#525252] block">Signed Off By</span>
                      <strong className="text-[#161616]">
                        {selectedRecordDetail.reviewer_id
                          ? formatOperatorName(selectedRecordDetail.reviewer_id)
                          : "Waiting for Sign-Off"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#525252] block">Shift &amp; Time</span>
                      <strong className="text-[#161616]">
                        {selectedRecordDetail.shift} ·{" "}
                        {formatFriendlyDateTime(selectedRecordDetail.created_at).time}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#525252] block">Review Duration</span>
                      <strong className="text-[#161616]">
                        {selectedRecordDetail.doc_time_s
                          ? `${selectedRecordDetail.doc_time_s} seconds`
                          : "In progress"}
                      </strong>
                    </div>
                  </div>

                  {selectedRecordDetail.review_notes && (
                    <div className="p-3 bg-[#f4f4f4] border-l-4 border-[#0f62fe] text-[12px]">
                      <span className="text-[#525252] block font-semibold">Inspector Note:</span>
                      <p className="text-[#161616] mt-0.5">{selectedRecordDetail.review_notes}</p>
                    </div>
                  )}

                  {/* Collapsible Technical Audit Trail */}
                  <div className="border-t border-[#e0e0e0] pt-3">
                    <button
                      type="button"
                      onClick={() => setShowDrawerTechAudit((v) => !v)}
                      className="text-[12px] text-[#525252] hover:text-[#0f62fe] flex items-center gap-1"
                    >
                      {showDrawerTechAudit ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span>
                        {showDrawerTechAudit
                          ? "Hide technical audit trail"
                          : "View technical audit trail (Record ID, Model, SHA-256)"}
                      </span>
                    </button>

                    {showDrawerTechAudit && (
                      <div className="mt-2 p-3 bg-[#f4f4f4] border border-[#e0e0e0] space-y-1.5 text-[11px] font-mono text-[#525252]">
                        <div>
                          Record ID:{" "}
                          <strong className="text-[#161616]">{selectedRecordDetail.id}</strong>
                        </div>
                        <div>
                          AI Source:{" "}
                          <strong className="text-[#161616]">
                            {selectedRecordDetail.ai_source} ({selectedRecordDetail.ai_latency_ms}ms)
                          </strong>
                        </div>
                        <div>
                          Model &amp; Prompt:{" "}
                          <strong className="text-[#161616]">
                            {selectedRecordDetail.model_id} · {selectedRecordDetail.prompt_version} (
                            {selectedRecordDetail.prompt_sha})
                          </strong>
                        </div>
                        <div>
                          Image SHA-256:{" "}
                          <strong className="text-[#161616]">
                            {selectedRecordDetail.image_sha256
                              ? `${selectedRecordDetail.image_sha256.slice(0, 24)}...`
                              : "Sample reference"}
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: SHOP-FLOOR QUALITY ANALYTICS (HUMAN-READABLE)                */}
        {/* =================================================================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="border border-[#e0e0e0] bg-[#ffffff] p-6 lg:p-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] text-[#0f62fe] mb-1">
                  Line Quality &amp; Inspection Performance Overview
                </p>
                <h1 className="text-[28px] lg:text-[36px] font-light text-[#161616]">
                  Quality &amp; Line Analytics
                </h1>
              </div>
              <button
                type="button"
                onClick={fetchAllData}
                className="carbon-btn-tertiary flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh Data</span>
              </button>
            </div>

            {/* 6 Clear, Human-Readable Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[13px] font-semibold text-[#525252] block">
                  Total Boards Inspected
                </span>
                <p className="text-[36px] font-light text-[#161616] mt-1">
                  {stats?.counts.total ?? 0}
                </p>
                <span className="text-[12px] text-[#525252]">
                  {stats?.counts.human_verified ?? 0} verified and signed off by inspectors
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#f4f4f4] p-5">
                <span className="text-[13px] font-semibold text-[#525252] block">
                  Waiting for Inspector Sign-Off
                </span>
                <p className="text-[36px] font-light text-[#da1e28] mt-1">
                  {stats?.counts.pending_review ?? 0}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRecordStatusFilter("pending_review");
                    setActiveTab("records");
                  }}
                  className="text-[12px] text-[#0f62fe] font-semibold hover:underline"
                >
                  Open pending boards in Quality Log →
                </button>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[13px] font-semibold text-[#525252] block">
                  Board Pass / Release Rate
                </span>
                <p className="text-[36px] font-light text-[#24a148] mt-1">
                  {passRatePct !== null ? `${passRatePct}%` : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  {stats?.disposition_counts?.pass ?? 0} boards passed ·{" "}
                  {stats?.disposition_counts?.rework ?? 0} sent to rework
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[13px] font-semibold text-[#525252] block">
                  AI Suggestion Accuracy
                </span>
                <p className="text-[36px] font-light text-[#0f62fe] mt-1">
                  {stats?.kpis.ai_precision_pct !== null &&
                  stats?.kpis.ai_precision_pct !== undefined
                    ? `${stats.kpis.ai_precision_pct}%`
                    : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  Share of AI findings confirmed by human inspectors
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[13px] font-semibold text-[#525252] block">
                  False Alarm Rate
                </span>
                <p className="text-[36px] font-light text-[#161616] mt-1">
                  {stats?.kpis.false_call_rate_pct !== null &&
                  stats?.kpis.false_call_rate_pct !== undefined
                    ? `${stats.kpis.false_call_rate_pct}%`
                    : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  AI flags dismissed as false alarms ({stats?.kpis.ai_flags_rejected ?? 0} dismissed)
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[13px] font-semibold text-[#525252] block">
                  Average Inspection &amp; Sign-Off Time
                </span>
                <p className="text-[36px] font-light text-[#161616] mt-1">
                  {stats?.kpis.avg_doc_time_s ? `${stats.kpis.avg_doc_time_s}s` : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  From selecting a board photo to final inspector sign-off
                </span>
              </div>
            </div>

            {/* Natural-Language Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Most Common Defect Types (Pareto) */}
              <div className="border border-[#e0e0e0] bg-[#ffffff] p-6 space-y-4">
                <div>
                  <span className="text-[12px] text-[#0f62fe] font-semibold block">
                    Issue Breakdown
                  </span>
                  <h2 className="text-[20px] font-normal text-[#161616]">
                    Most Common Confirmed Defect Types
                  </h2>
                </div>
                <div className="space-y-3.5">
                  {(stats?.pareto_defects || []).map((item) => {
                    const maxCount = Math.max(
                      1,
                      ...(stats?.pareto_defects.map((d) => d.count) || [1])
                    );
                    const totalDefects = Math.max(
                      1,
                      (stats?.pareto_defects || []).reduce((acc, d) => acc + d.count, 0)
                    );
                    const widthPct = Math.round((item.count / maxCount) * 100);
                    const sharePct = Math.round((item.count / totalDefects) * 100);
                    return (
                      <div key={item.defect_class} className="space-y-1">
                        <div className="flex justify-between text-[13px]">
                          <span className="font-semibold text-[#161616]">
                            {formatDefectClass(item.defect_class)}
                          </span>
                          <span className="text-[#525252]">
                            <strong className="text-[#161616]">{item.count}</strong> (
                            {sharePct}%)
                          </span>
                        </div>
                        <div className="w-full h-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                          <div
                            style={{ width: `${widthPct}%` }}
                            className="h-full bg-[#0f62fe]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Final Board Decisions & Inspector Agreement */}
              <div className="border border-[#e0e0e0] bg-[#ffffff] p-6 space-y-6">
                <div>
                  <span className="text-[12px] text-[#0f62fe] font-semibold block">
                    Inspection Outcomes
                  </span>
                  <h2 className="text-[20px] font-normal text-[#161616]">
                    Final Board Decisions &amp; Inspector Agreement
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(["pass", "rework", "quarantine", "escalate"] as const).map((d) => (
                    <div key={d} className="p-3.5 bg-[#f4f4f4] border border-[#e0e0e0]">
                      <span className="text-[12px] font-semibold text-[#525252] block">
                        {DISPOSITION_INFO[d].shortLabel}
                      </span>
                      <strong className="text-[26px] font-light text-[#161616]">
                        {stats?.disposition_counts?.[d] ?? 0}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-2 border-t border-[#e0e0e0]">
                  <span className="text-[12px] font-semibold text-[#525252] block">
                    How often inspectors agreed with the initial AI suggestion:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { key: "agree", label: "Confirmed AI Finding" },
                      { key: "partial", label: "Adjusted by Operator" },
                      { key: "disagree", label: "Overridden by Operator" },
                    ].map((ag) => (
                      <div key={ag.key} className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                        <span className="text-[12px] text-[#525252] block">{ag.label}</span>
                        <strong className="text-[22px] font-light text-[#161616]">
                          {stats?.agreement_counts?.[ag.key] ?? 0}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Collapsible Lean Six Sigma (DMAIC) & System Telemetry Section */}
            <div className="border border-[#e0e0e0] bg-[#f4f4f4] p-5">
              <button
                type="button"
                onClick={() => setShowDmaicDetails((v) => !v)}
                className="w-full flex items-center justify-between text-left"
              >
                <div>
                  <span className="text-[12px] text-[#0f62fe] font-semibold block">
                    Quality Engineering Methodology &amp; System Telemetry
                  </span>
                  <h3 className="text-[16px] font-semibold text-[#161616]">
                    Lean Six Sigma (DMAIC) Alignment &amp; AI Performance Metrics
                  </h3>
                </div>
                {showDmaicDetails ? (
                  <ChevronDown className="w-5 h-5 text-[#161616]" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-[#161616]" />
                )}
              </button>

              {showDmaicDetails && (
                <div className="mt-4 pt-4 border-t border-[#e0e0e0] space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
                    <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                      <span className="text-[12px] text-[#525252] block">
                        AI Detection Coverage (Recall Proxy)
                      </span>
                      <strong className="text-[20px] font-light text-[#161616]">
                        {stats?.kpis.ai_recall_proxy_pct !== null &&
                        stats?.kpis.ai_recall_proxy_pct !== undefined
                          ? `${stats.kpis.ai_recall_proxy_pct}%`
                          : "—"}
                      </strong>
                      <span className="text-[11px] text-[#525252] block">
                        Issues added manually by inspector: {stats?.kpis.human_added_defects ?? 0}
                      </span>
                    </div>
                    <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                      <span className="text-[12px] text-[#525252] block">
                        Audit Record Completeness
                      </span>
                      <strong className="text-[20px] font-light text-[#24a148]">
                        {stats?.kpis.traceability_completeness_pct ?? 100}%
                      </strong>
                      <span className="text-[11px] text-[#525252] block">
                        Includes board ID, operator, timestamp, and sign-off
                      </span>
                    </div>
                    <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                      <span className="text-[12px] text-[#525252] block">
                        Average Live AI Scan Speed
                      </span>
                      <strong className="text-[20px] font-light text-[#0f62fe]">
                        {stats?.kpis.avg_ai_latency_ms
                          ? `${(stats.kpis.avg_ai_latency_ms / 1000).toFixed(1)}s`
                          : "—"}
                      </strong>
                      <span className="text-[11px] text-[#525252] block">
                        Model: {config?.model_id || "gemma-4-26b-a4b-it"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-[13px]">
                    <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                      <strong className="text-[#0f62fe] block mb-1">Define</strong>
                      Replaces slow paper and chat PCB defect logs in Batam Tier-2/3 lines and SMK labs with a structured digital record.
                    </div>
                    <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                      <strong className="text-[#0f62fe] block mb-1">Measure</strong>
                      Tracks review time, AI suggestion accuracy, false-alarm rate, and 100% record completeness.
                    </div>
                    <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                      <strong className="text-[#0f62fe] block mb-1">Analyze</strong>
                      Groups confirmed defects by issue type, priority, production line, operator, and shift.
                    </div>
                    <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                      <strong className="text-[#0f62fe] block mb-1">Improve</strong>
                      Uses multimodal Gemma 4 to spot visible issues across 6 standard categories while keeping the human in control.
                    </div>
                    <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                      <strong className="text-[#0f62fe] block mb-1">Control</strong>
                      Requires human sign-off on every board, tracks false alarms, and exports audit-ready spreadsheets.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Carbon Inverted Footer */}
      <footer className="bg-[#161616] text-[#c6c6c6] px-4 lg:px-8 py-10 mt-12 border-t border-[#262626]">
        <div className="max-w-[1584px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-[14px] leading-[1.29] tracking-[0.16px]">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#ffffff] font-semibold">
              <span className="inline-block w-3 h-3 bg-[#0f62fe]" />
              <span>AOI-Lite Batam: AI-Assisted SMT Inspection</span>
            </div>
            <p className="text-[12px] text-[#c6c6c6] leading-[1.5]">
              Open-source, human-in-the-loop SMT/PCBA visual inspection &amp; quality-record assistant powered by Google Gemma 4.
            </p>
          </div>

          <div className="space-y-1.5 text-[12px]">
            <p className="text-[#ffffff] font-semibold mb-2">6 Visual Inspection Checks</p>
            <p>Missing Component · Solder Bridge / Short</p>
            <p>Wrong Polarity · Tombstoning (Lifted Chip)</p>
            <p>Misaligned Component · Copper / Trace Anomaly</p>
          </div>

          <div className="space-y-1.5 text-[12px]">
            <p className="text-[#ffffff] font-semibold mb-2">Quality &amp; Safety Rules</p>
            <p>Mandatory human sign-off on every board</p>
            <p>Hidden BGA/QFN joints require X-ray check</p>
            <p>Zero autonomous pass/fail release decisions</p>
          </div>

          <div className="space-y-1.5 text-[12px]">
            <p className="text-[#ffffff] font-semibold mb-2">Hacktoberfest Hack Day Batam</p>
            <p>Kota Batam × Batam Innovation Center</p>
            <p>Open-Source MIT License · Powered by Gemma 4</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
