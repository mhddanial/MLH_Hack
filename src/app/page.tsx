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

const DEFECT_LABELS: Record<DefectClass, string> = {
  missing_component: "Missing component",
  solder_bridge: "Solder bridge / short",
  polarity_error: "Polarity / orientation error",
  tombstoning: "Tombstoning (lifted chip)",
  component_shift: "Component shift / misalignment",
  uncertain_or_other: "Uncertain or other surface anomaly",
};

const DISPOSITION_INFO: Record<
  FinalDisposition,
  { label: string; desc: string; borderColor: string; bgColor: string; textColor: string }
> = {
  pass: {
    label: "Pass (release to next station)",
    desc: "Board meets visible IPC-A-610 criteria; no active defects remain.",
    borderColor: "border-[#24a148]",
    bgColor: "bg-[#24a148]",
    textColor: "text-[#ffffff]",
  },
  rework: {
    label: "Rework (route to touch-up bench)",
    desc: "Visible solder or placement defect requires operator rework and re-inspection.",
    borderColor: "border-[#0f62fe]",
    bgColor: "bg-[#0f62fe]",
    textColor: "text-[#ffffff]",
  },
  quarantine: {
    label: "Quarantine (hold lot / MRB)",
    desc: "Critical defect or bare-board anomaly; isolate board in Material Review Board cage.",
    borderColor: "border-[#da1e28]",
    bgColor: "bg-[#da1e28]",
    textColor: "text-[#ffffff]",
  },
  escalate: {
    label: "Escalate (QA engineer / X-ray)",
    desc: "Ambiguous anomaly or suspected hidden joint; escalate to Senior QA or X-ray.",
    borderColor: "border-[#f1c21b]",
    bgColor: "bg-[#f1c21b]",
    textColor: "text-[#161616]",
  },
};

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
  const [selectedSampleId, setSelectedSampleId] = useState<string>("pku_short_01");
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

  // Step 2: Metadata & Analyze
  const [boardId, setBoardId] = useState<string>("BAT-PCBA-101");
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
    () => samples.find((s) => s.id === selectedSampleId) || null,
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
        `Browser camera stream unavailable (${msg}). Use the mobile camera / file upload button below.`
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

    const maxSide = config?.confidence_threshold ? 1400 : 1400;
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

    // Compute mean brightness
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
      // Low confidence (<0.60) or uncertain_or_other defaults to escalate/edit review attention;
      // high confidence defaults to accept so operator can confirm or override in 1 click
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

    // Suggest a sensible initial human disposition tab without auto-saving it
    const origDisp = rec.original_ai_disposition || rec.ai_result?.overall_disposition;
    if (origDisp === "rework" || origDisp === "quarantine" || origDisp === "escalate") {
      setFinalDisposition(origDisp);
    } else if (aiDefects.length === 0 && rec.status === "pending_review") {
      setFinalDisposition("pass");
    } else {
      setFinalDisposition("");
    }
    setReviewNotes(rec.review_notes || "");
    setReviewError(null);
  };

  // Step 2 Action: Trigger Gemma 4 Analysis or Manual Entry
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

      if (captureMode === "sample") {
        payload.sample_id = selectedSampleId;
      } else if (uploadedDataUrl) {
        payload.image_base64 = uploadedDataUrl;
        payload.image_name = uploadedFileName || "captured_pcb.jpg";
        payload.image_sha256 = imageSha256;
      } else {
        setAnalyzeError("Please select a sample PCB image or upload/capture a photo first.");
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

  // Add a human-detected missed defect (False Negative)
  const addHumanDefect = () => {
    setDefectReviews((prev) => [
      ...prev,
      {
        ai_index: null,
        action: "accept",
        defect_class: "solder_bridge",
        severity: "high",
        location_hint: "Specify board quadrant / component ref (e.g., U3 pin 4-5)",
        note: "Added manually by inspector (missed by AI)",
      },
    ]);
  };

  const removeHumanDefect = (index: number) => {
    setDefectReviews((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Submit Step 4 Human Confirmation
  const handleConfirmReview = async () => {
    if (!currentRecord) return;
    if (!finalDisposition) {
      setReviewError(
        "Human verification guardrail: You must select a final disposition (Pass, Rework, Quarantine, or Escalate) before saving."
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
        throw new Error(data.error || "Failed to save human review");
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
    setStartedAtIso(new Date().toISOString());
    setElapsedDocSec(0);
  };

  // Current active workflow step (1..5)
  const currentWorkflowStep = useMemo(() => {
    if (!currentRecord) return 1;
    if (currentRecord.status === "confirmed" || currentRecord.status === "escalated") {
      return 5;
    }
    return 3;
  }, [currentRecord]);

  // Active preview image URL
  const activeImageUrl = useMemo(() => {
    if (captureMode === "sample" && selectedSample) {
      return selectedSample.image_url;
    }
    return uploadedDataUrl || null;
  }, [captureMode, selectedSample, uploadedDataUrl]);

  // Filtered records for Records tab
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (recordStatusFilter === "all") return true;
      if (recordStatusFilter === "pending_review") {
        return r.status === "pending_review" || r.status === "manual_required";
      }
      return r.status === recordStatusFilter;
    });
  }, [records, recordStatusFilter]);

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#161616]">
      {/* Carbon Utility Bar (height: 32px, #f4f4f4 surface-1, 12px caption with 0.32px tracking) */}
      <div className="min-h-[32px] bg-[#f4f4f4] border-b border-[#e0e0e0] px-4 lg:px-8 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px] leading-[1.33] tracking-[0.32px] text-[#525252]">
        <div className="flex items-center gap-2 font-semibold text-[#161616]">
          <AlertTriangle className="w-3.5 h-3.5 text-[#da1e28] shrink-0" />
          <span>
            AI assistance only. Final quality disposition requires human verification. Hidden solder joints (BGA/QFN voids, head-in-pillow) require X-ray inspection.
          </span>
        </div>
        <div className="hidden xl:flex items-center gap-4 font-mono text-[11px]">
          <span>Model: {config?.model_id || "gemma-4-26b-a4b-it"}</span>
          <span>Prompt: {config?.prompt_version || "aoi-prompt-v1.0"}</span>
          <span>
            Storage:{" "}
            <strong className="text-[#0f62fe]">
              {storageBackend === "supabase" ? "Supabase PostgreSQL" : "Local JSON Fallback"}
            </strong>
          </span>
        </div>
      </div>

      {/* Carbon Top Nav (height: 48px, #ffffff canvas, 1px bottom hairline) */}
      <header className="min-h-[48px] bg-[#ffffff] border-b border-[#e0e0e0] px-4 lg:px-8 flex flex-wrap items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 py-2">
            <span className="inline-block w-3 h-3 bg-[#0f62fe]" />
            <span className="text-[16px] font-semibold tracking-[0.16px] text-[#161616]">
              AOI-Lite Batam
            </span>
            <span className="text-[12px] tracking-[0.32px] text-[#525252] border border-[#e0e0e0] bg-[#f4f4f4] px-2 py-0.5">
              Gemma 4 Multimodal
            </span>
          </div>

          {/* Carbon Product Tabs (0px corners, 2px #0f62fe bottom underline when selected) */}
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
              <span>Inspect station</span>
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
              <span>Quality records ({records.length})</span>
              {stats && stats.counts.pending_review > 0 && (
                <span className="bg-[#f1c21b] text-[#161616] text-[12px] font-semibold px-1.5 py-0.5">
                  {stats.counts.pending_review} pending
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
              <span>DMAIC dashboard</span>
            </button>
          </nav>
        </div>

        {/* Right status & quick export buttons */}
        <div className="flex items-center gap-2 py-1.5">
          <a
            href="/api/export/csv"
            className="px-3 py-2 text-[12px] tracking-[0.32px] text-[#0f62fe] border border-[#0f62fe] hover:bg-[#0f62fe] hover:text-[#ffffff] transition-colors flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
          <a
            href="/api/export/json"
            className="px-3 py-2 text-[12px] tracking-[0.32px] text-[#161616] border border-[#e0e0e0] bg-[#f4f4f4] hover:bg-[#e0e0e0] transition-colors flex items-center gap-1.5"
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </a>
        </div>
      </header>

      {/* Main Content Container (Max width 1584px per Carbon grid spec) */}
      <main className="flex-1 w-full max-w-[1584px] mx-auto px-4 lg:px-8 py-6">
        {/* =================================================================== */}
        {/* TAB 1: INSPECT STATION (5-STEP WORKFLOW)                            */}
        {/* =================================================================== */}
        {activeTab === "inspect" && (
          <div className="space-y-6">
            {/* Carbon Hero Header + 5-Step Progress Strip */}
            <section className="border border-[#e0e0e0] bg-[#ffffff]">
              <div className="p-6 lg:p-8 border-b border-[#e0e0e0] flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                  <p className="text-[14px] leading-[1.29] tracking-[0.16px] text-[#0f62fe] mb-2">
                    Surface-mount technology (SMT) quality station · Batam industrial &amp; SMK lab edition
                  </p>
                  <h1 className="text-[32px] lg:text-[42px] font-light leading-[1.20] text-[#161616]">
                    Human-in-the-loop PCB visual inspection
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12px] tracking-[0.32px] text-[#525252]">
                  <div className="bg-[#f4f4f4] border border-[#e0e0e0] px-3 py-2 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#0f62fe]" />
                    <span>Doc timer: </span>
                    <strong className="font-mono text-[#161616]">{elapsedDocSec}s</strong>
                  </div>
                  <div className="bg-[#f4f4f4] border border-[#e0e0e0] px-3 py-2">
                    Confidence gate:{" "}
                    <strong className="font-mono text-[#161616]">
                      {Math.round((config?.confidence_threshold ?? 0.6) * 100)}%
                    </strong>
                  </div>
                </div>
              </div>

              {/* 5-Step Workflow Progress Bar */}
              <div className="grid grid-cols-2 lg:grid-cols-5 bg-[#f4f4f4] divide-y lg:divide-y-0 lg:divide-x divide-[#e0e0e0]">
                {[
                  { step: 1, title: "1. Capture image", sub: "Sample, upload, or camera" },
                  { step: 2, title: "2. Metadata & AI", sub: "Gemma 4 multimodal inference" },
                  { step: 3, title: "3. Review defects", sub: "Accept, edit, reject, escalate" },
                  { step: 4, title: "4. Confirm disposition", sub: "Human sign-off required" },
                  { step: 5, title: "5. Audit & export", sub: "Supabase + CSV / JSON" },
                ].map((item) => {
                  const isActive =
                    (item.step <= 2 && currentWorkflowStep === 1) ||
                    ((item.step === 3 || item.step === 4) && currentWorkflowStep === 3) ||
                    (item.step === 5 && currentWorkflowStep === 5);
                  const isDone = item.step < currentWorkflowStep;
                  return (
                    <div
                      key={item.step}
                      className={`p-4 border-t-2 transition-colors ${
                        isActive
                          ? "border-[#0f62fe] bg-[#ffffff]"
                          : isDone
                          ? "border-[#24a148] bg-[#f4f4f4]"
                          : "border-transparent bg-[#f4f4f4]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[14px] font-semibold tracking-[0.16px] text-[#161616]">
                          {item.title}
                        </span>
                        {isDone && <Check className="w-4 h-4 text-[#24a148]" />}
                      </div>
                      <p className="text-[12px] tracking-[0.32px] text-[#525252]">{item.sub}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Main 2-Column Workspace: Left = Step 1 & Step 2 | Right = Step 3, 4, 5 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN (5 cols on lg): Step 1 (Image Capture) + Step 2 (Metadata & Analyze) */}
              <div className="lg:col-span-5 space-y-6">
                {/* STEP 1 CARD: CAPTURE OR SELECT PCB IMAGE */}
                <div className="border border-[#e0e0e0] bg-[#ffffff]">
                  <div className="px-6 py-4 bg-[#f4f4f4] border-b border-[#e0e0e0] flex items-center justify-between">
                    <div>
                      <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                        Step 1 of 5
                      </span>
                      <h2 className="text-[20px] font-normal leading-[1.40] text-[#161616]">
                        Capture or select PCB image
                      </h2>
                    </div>
                    <span className="text-[12px] font-mono bg-[#ffffff] border border-[#e0e0e0] px-2.5 py-1 text-[#161616]">
                      {captureMode === "sample"
                        ? `Sample: ${selectedSampleId}`
                        : uploadedFileName || "Custom image"}
                    </span>
                  </div>

                  {/* Capture Mode Switcher */}
                  <div className="grid grid-cols-3 border-b border-[#e0e0e0]">
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setCaptureMode("sample");
                      }}
                      className={`min-h-[48px] px-3 py-2 text-[14px] tracking-[0.16px] border-b-2 flex items-center justify-center gap-2 ${
                        captureMode === "sample"
                          ? "border-[#0f62fe] bg-[#ffffff] font-semibold text-[#161616]"
                          : "border-transparent bg-[#f4f4f4] text-[#525252] hover:text-[#161616]"
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                      <span>Sample gallery (16)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setCaptureMode("upload");
                      }}
                      className={`min-h-[48px] px-3 py-2 text-[14px] tracking-[0.16px] border-b-2 flex items-center justify-center gap-2 ${
                        captureMode === "upload"
                          ? "border-[#0f62fe] bg-[#ffffff] font-semibold text-[#161616]"
                          : "border-transparent bg-[#f4f4f4] text-[#525252] hover:text-[#161616]"
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCaptureMode("camera");
                      }}
                      className={`min-h-[48px] px-3 py-2 text-[14px] tracking-[0.16px] border-b-2 flex items-center justify-center gap-2 ${
                        captureMode === "camera"
                          ? "border-[#0f62fe] bg-[#ffffff] font-semibold text-[#161616]"
                          : "border-transparent bg-[#f4f4f4] text-[#525252] hover:text-[#161616]"
                      }`}
                    >
                      <Camera className="w-4 h-4" />
                      <span>Camera capture</span>
                    </button>
                  </div>

                  <div className="p-6 space-y-4">
                    {/* Mode A: Sample Gallery */}
                    {captureMode === "sample" && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12px] tracking-[0.32px] text-[#525252]">
                            Filter preloaded boards:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {[
                              { id: "all", label: "All (16)" },
                              { id: "smt", label: "SMT assembly (4)" },
                              { id: "pku", label: "PKU bare-PCB (10)" },
                              { id: "golden", label: "Golden pass (2)" },
                            ].map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() =>
                                  setSampleFilter(f.id as "all" | "smt" | "pku" | "golden")
                                }
                                className={`px-2.5 py-1 text-[12px] tracking-[0.32px] border ${
                                  sampleFilter === f.id
                                    ? "border-[#0f62fe] bg-[#0f62fe] text-[#ffffff]"
                                    : "border-[#e0e0e0] bg-[#f4f4f4] text-[#161616] hover:bg-[#e0e0e0]"
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[240px] overflow-y-auto p-1 border border-[#e0e0e0] bg-[#f4f4f4]">
                          {filteredSamples.map((smp) => {
                            const selected = smp.id === selectedSampleId;
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
                                    <span className="absolute top-1 left-1 bg-[#24a148] text-[#ffffff] text-[10px] px-1 py-0.5 font-semibold">
                                      GOLDEN
                                    </span>
                                  )}
                                  {smp.has_cache && (
                                    <span
                                      title="Offline cached Gemma 4 response available"
                                      className="absolute bottom-1 right-1 bg-[#161616] text-[#ffffff] text-[9px] px-1 py-0.5 font-mono"
                                    >
                                      CACHED
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[12px] font-semibold text-[#161616] truncate">
                                    {smp.title}
                                  </p>
                                  <p className="text-[11px] font-mono text-[#525252] truncate">
                                    {smp.expected_defect_class}
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
                            Select a PCB macro photograph (JPEG / PNG / WebP)
                          </p>
                          <p className="text-[12px] text-[#525252]">
                            Client-side pre-processor resizes to max 1400px and computes SHA-256 hash.
                          </p>
                        </div>
                        <label className="carbon-btn-primary inline-flex items-center gap-2 cursor-pointer">
                          <Upload className="w-4 h-4" />
                          <span>Choose PCB image file</span>
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
                            Bench / tablet camera capture
                          </span>
                          <div className="flex gap-2">
                            {!cameraActive ? (
                              <button
                                type="button"
                                onClick={startCamera}
                                className="carbon-btn-primary flex items-center gap-2"
                              >
                                <Camera className="w-4 h-4" />
                                <span>Start live camera</span>
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={captureSnapshotFromVideo}
                                  className="carbon-btn-primary flex items-center gap-2"
                                >
                                  <Camera className="w-4 h-4" />
                                  <span>Capture frame</span>
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
                              <p>Camera preview inactive.</p>
                              <label className="carbon-btn-tertiary inline-flex items-center gap-2 cursor-pointer">
                                <Camera className="w-4 h-4" />
                                <span>Fallback: Open mobile camera / file picker</span>
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

                    {/* Active PCB Image Preview + Ground-Truth Overlay Toggle */}
                    {activeImageUrl && (
                      <div className="border border-[#e0e0e0] bg-[#161616]">
                        <div className="px-3 py-2 bg-[#262626] text-[#ffffff] text-[12px] flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono truncate">
                            {captureMode === "sample" && selectedSample
                              ? `${selectedSample.title} (${selectedSample.width}×${selectedSample.height}px)`
                              : `${uploadedFileName || "Uploaded PCB"} ${
                                  precheckInfo
                                    ? `(${precheckInfo.width}×${precheckInfo.height}px · ${precheckInfo.status})`
                                    : ""
                                }`}
                          </span>
                          {captureMode === "sample" &&
                            selectedSample?.bboxes &&
                            selectedSample.bboxes.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowGroundTruthBoxes((v) => !v)}
                                className={`px-2 py-0.5 text-[11px] border transition-colors flex items-center gap-1 ${
                                  showGroundTruthBoxes
                                    ? "border-[#f1c21b] bg-[#f1c21b] text-[#161616] font-semibold"
                                    : "border-[#8c8c8c] text-[#c6c6c6] hover:text-[#ffffff]"
                                }`}
                              >
                                <Eye className="w-3 h-3" />
                                <span>
                                  {showGroundTruthBoxes
                                    ? "Hide dataset ROI boxes"
                                    : `Show dataset ROI boxes (${selectedSample.bboxes.length})`}
                                </span>
                              </button>
                            )}
                        </div>

                        <div className="relative w-full max-h-[340px] flex items-center justify-center overflow-hidden bg-[#161616]">
                          <div className="relative inline-block w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={activeImageUrl}
                              alt="Active PCB inspection target"
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
                                    <span className="bg-[#f1c21b] text-[#161616] text-[10px] font-mono font-semibold px-1 py-0.5 absolute -top-5 left-0 whitespace-nowrap">
                                      {box.orig_label} ({box.quadrant})
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>

                        {captureMode === "sample" && selectedSample && (
                          <div className="p-3 bg-[#f4f4f4] border-t border-[#e0e0e0] text-[12px] text-[#525252] flex flex-wrap items-center justify-between gap-2">
                            <span>{selectedSample.description}</span>
                            <span className="font-mono text-[#161616]">
                              Ref class: <strong>{selectedSample.expected_defect_class}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* STEP 2 CARD: PCB METADATA & GEMMA 4 INFERENCE */}
                <div className="border border-[#e0e0e0] bg-[#ffffff]">
                  <div className="px-6 py-4 bg-[#f4f4f4] border-b border-[#e0e0e0]">
                    <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                      Step 2 of 5
                    </span>
                    <h2 className="text-[20px] font-normal leading-[1.40] text-[#161616]">
                      Station metadata &amp; Gemma 4 analysis
                    </h2>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[12px] tracking-[0.32px] text-[#525252] mb-1">
                          Board ID / serial
                        </label>
                        <input
                          type="text"
                          value={boardId}
                          onChange={(e) => setBoardId(e.target.value)}
                          className="carbon-input w-full font-mono text-[14px]"
                          placeholder="BAT-PCBA-101"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] tracking-[0.32px] text-[#525252] mb-1">
                          Board revision
                        </label>
                        <input
                          type="text"
                          value={boardRevision}
                          onChange={(e) => setBoardRevision(e.target.value)}
                          className="carbon-input w-full font-mono text-[14px]"
                          placeholder="Rev A"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[12px] tracking-[0.32px] text-[#525252] mb-1">
                          Line / inspection station
                        </label>
                        <select
                          value={lineStation}
                          onChange={(e) => setLineStation(e.target.value)}
                          className="carbon-input w-full text-[14px]"
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
                              {ln}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[12px] tracking-[0.32px] text-[#525252] mb-1">
                          Operator ID
                        </label>
                        <select
                          value={operatorId}
                          onChange={(e) => {
                            setOperatorId(e.target.value);
                            setReviewerId(e.target.value);
                          }}
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
                              {op}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] tracking-[0.32px] text-[#525252] mb-1">
                        Inspection stage
                      </label>
                      <select
                        value={inspectionType}
                        onChange={(e) => setInspectionType(e.target.value)}
                        className="carbon-input w-full text-[14px]"
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
                            {tp.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </div>

                    {analyzeError && (
                      <div className="p-3 bg-[#f4f4f4] border-l-4 border-[#da1e28] text-[14px] text-[#161616]">
                        <strong className="font-semibold text-[#da1e28]">Error: </strong>
                        {analyzeError}
                      </div>
                    )}

                    <div className="pt-2 flex flex-col sm:flex-row gap-3">
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
                              Analyzing with Gemma 4 ({(analyzeElapsedMs / 1000).toFixed(1)}s)...
                            </span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Analyze with Gemma 4</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => handleAnalyze(true)}
                        className="carbon-btn-secondary flex items-center justify-center gap-2"
                        title="Bypass AI inference and log defects manually"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>Direct manual entry</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN (7 cols on lg): Step 3 (Review) + Step 4 (Disposition) + Step 5 (Confirmed) */}
              <div className="lg:col-span-7 space-y-6">
                {!currentRecord ? (
                  <div className="border border-[#e0e0e0] bg-[#f4f4f4] p-12 text-center space-y-4">
                    <Cpu className="w-10 h-10 text-[#0f62fe] mx-auto" />
                    <div className="max-w-lg mx-auto space-y-2">
                      <h3 className="text-[24px] font-light text-[#161616]">
                        Awaiting PCB analysis or manual entry
                      </h3>
                      <p className="text-[14px] text-[#525252] leading-[1.5]">
                        Select a PCB sample on the left (or upload/capture a board photo), verify the station metadata, and click{" "}
                        <strong className="text-[#161616]">Analyze with Gemma 4</strong>. The model returns a strict Zod-validated JSON report for human review.
                      </p>
                    </div>
                    <div className="max-w-xl mx-auto pt-4 border-t border-[#e0e0e0] text-[12px] text-[#525252] grid grid-cols-2 sm:grid-cols-3 gap-2 text-left">
                      <div className="p-2.5 bg-[#ffffff] border border-[#e0e0e0]">
                        <span className="font-mono text-[#0f62fe] block">missing_component</span>
                        <span>Empty pad / unpopulated footprint</span>
                      </div>
                      <div className="p-2.5 bg-[#ffffff] border border-[#e0e0e0]">
                        <span className="font-mono text-[#0f62fe] block">solder_bridge</span>
                        <span>Unintended solder or copper short</span>
                      </div>
                      <div className="p-2.5 bg-[#ffffff] border border-[#e0e0e0]">
                        <span className="font-mono text-[#0f62fe] block">polarity_error</span>
                        <span>Reversed diode/IC orientation</span>
                      </div>
                      <div className="p-2.5 bg-[#ffffff] border border-[#e0e0e0]">
                        <span className="font-mono text-[#0f62fe] block">tombstoning</span>
                        <span>Lifted passive chip termination</span>
                      </div>
                      <div className="p-2.5 bg-[#ffffff] border border-[#e0e0e0]">
                        <span className="font-mono text-[#0f62fe] block">component_shift</span>
                        <span>Skewed off-pad SMD placement</span>
                      </div>
                      <div className="p-2.5 bg-[#ffffff] border border-[#e0e0e0]">
                        <span className="font-mono text-[#0f62fe] block">uncertain_or_other</span>
                        <span>Open trace, spur, pinhole, ambiguous</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* STEP 3 CARD: AI-SUGGESTED DEFECT REVIEW */}
                    <div className="border border-[#e0e0e0] bg-[#ffffff]">
                      {/* Prominent AI-SUGGESTED vs HUMAN-CONFIRMED Status Banner */}
                      {currentRecord.status === "confirmed" ||
                      currentRecord.status === "escalated" ? (
                        <div
                          className={`px-6 py-4 border-b border-[#e0e0e0] flex flex-wrap items-center justify-between gap-2 ${
                            currentRecord.status === "confirmed"
                              ? "bg-[#24a148] text-[#ffffff]"
                              : "bg-[#f1c21b] text-[#161616]"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                            <div>
                              <span className="text-[12px] font-mono uppercase tracking-[0.32px] block">
                                Step 5 of 5 · Quality record locked
                              </span>
                              <h2 className="text-[20px] font-semibold">
                                {currentRecord.status === "confirmed"
                                  ? `Human-confirmed disposition: ${currentRecord.final_disposition?.toUpperCase()}`
                                  : `Escalated to QA / X-ray: ${currentRecord.final_disposition?.toUpperCase()}`}
                              </h2>
                            </div>
                          </div>
                          <div className="text-right font-mono text-[12px]">
                            <div>ID: {currentRecord.id}</div>
                            <div>Agreement: {currentRecord.human_agreement}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="px-6 py-4 bg-[#f1c21b] text-[#161616] border-b border-[#e0e0e0] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <ShieldAlert className="w-5 h-5 shrink-0" />
                            <div>
                              <span className="text-[12px] font-mono uppercase tracking-[0.32px] block">
                                Step 3 of 5 · AI-suggested — pending operator confirmation
                              </span>
                              <h2 className="text-[18px] font-semibold">
                                Review Gemma 4 findings before issuing final disposition
                              </h2>
                            </div>
                          </div>
                          <span className="bg-[#161616] text-[#ffffff] px-2.5 py-1 text-[12px] font-mono">
                            {currentRecord.ai_source === "live_gemma"
                              ? "LIVE GEMMA 4"
                              : currentRecord.ai_source === "cached_sample"
                              ? "CACHED GEMMA 4"
                              : "MANUAL FALLBACK"}
                          </span>
                        </div>
                      )}

                      {/* Telemetry & Audit Strip */}
                      <div className="px-6 py-3 bg-[#f4f4f4] border-b border-[#e0e0e0] grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                        <div>
                          <span className="text-[#525252] block">Inspection ID</span>
                          <strong className="font-mono text-[#161616]">{currentRecord.id}</strong>
                        </div>
                        <div>
                          <span className="text-[#525252] block">Model &amp; latency</span>
                          <strong className="font-mono text-[#161616]">
                            {currentRecord.model_id} ({currentRecord.ai_latency_ms}ms ·{" "}
                            {currentRecord.ai_attempts} try)
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#525252] block">Image quality</span>
                          <strong
                            className={`font-mono uppercase ${
                              currentRecord.ai_result?.image_quality === "acceptable"
                                ? "text-[#24a148]"
                                : "text-[#da1e28]"
                            }`}
                          >
                            {currentRecord.ai_result?.image_quality || "manual"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#525252] block">AI suggested disposition</span>
                          <strong className="font-mono text-[#0f62fe]">
                            {currentRecord.ai_result?.overall_disposition || "manual_entry"}
                          </strong>
                        </div>
                      </div>

                      <div className="p-6 space-y-5">
                        {/* Safety Routing Reasons / Fallback Notices */}
                        {(currentRecord.routing_reasons?.length > 0 ||
                          currentRecord.ai_errors?.length > 0) && (
                          <div className="p-4 bg-[#f4f4f4] border-l-4 border-[#0f62fe] space-y-1 text-[13px]">
                            <p className="font-semibold text-[#161616]">
                              Safety guardrail &amp; routing notices:
                            </p>
                            {currentRecord.routing_reasons?.map((reason, i) => (
                              <p key={`r-${i}`} className="text-[#525252]">
                                • {reason}
                              </p>
                            ))}
                            {currentRecord.ai_errors?.map((err, i) => (
                              <p key={`e-${i}`} className="text-[#da1e28] font-mono text-[12px]">
                                • {err}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* OCR Visible Labels & AI Summary Notes */}
                        {currentRecord.ai_result && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#f4f4f4] border border-[#e0e0e0] text-[13px]">
                            <div>
                              <span className="text-[12px] text-[#525252] block mb-1">
                                Visible silkscreen / OCR labels detected:
                              </span>
                              {currentRecord.ai_result.visible_labels?.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {currentRecord.ai_result.visible_labels.map((lbl, idx) => (
                                    <span
                                      key={idx}
                                      className="font-mono text-[12px] bg-[#ffffff] border border-[#e0e0e0] px-2 py-0.5 text-[#161616]"
                                    >
                                      {lbl}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[#525252] italic">
                                  No silkscreen text labels detected on this board view
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="text-[12px] text-[#525252] block mb-1">
                                Gemma 4 inspection notes:
                              </span>
                              <p className="text-[#161616]">
                                {currentRecord.ai_result.notes || "No additional notes."}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Per-Defect Review List */}
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-[18px] font-normal text-[#161616]">
                              Defect findings &amp; human verification ({defectReviews.length})
                            </h3>
                            {currentRecord.status !== "confirmed" &&
                              currentRecord.status !== "escalated" && (
                                <button
                                  type="button"
                                  onClick={addHumanDefect}
                                  className="carbon-btn-tertiary !min-h-[38px] !py-1.5 !px-3 text-[13px] flex items-center gap-1.5"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>Add missed defect (false negative)</span>
                                </button>
                              )}
                          </div>

                          {defectReviews.length === 0 ? (
                            <div className="p-6 border border-[#e0e0e0] bg-[#f4f4f4] text-center space-y-2">
                              <CheckCircle2 className="w-7 h-7 text-[#24a148] mx-auto" />
                              <p className="text-[15px] font-semibold text-[#161616]">
                                Zero visible defects reported by Gemma 4
                              </p>
                              <p className="text-[13px] text-[#525252]">
                                Visually inspect the board image to confirm no missing components, bridges, or shifts exist, or click{" "}
                                <strong>Add missed defect</strong> above if you spot an anomaly.
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
                                        <span className="bg-[#161616] text-[#ffffff] text-[11px] font-mono px-2 py-0.5">
                                          {aiDefect ? `AI FINDING #${idx + 1}` : `HUMAN ADDED #${idx + 1}`}
                                        </span>
                                        <span className="text-[16px] font-semibold text-[#161616]">
                                          {DEFECT_LABELS[rev.defect_class] || rev.defect_class}
                                        </span>
                                        <span className="font-mono text-[12px] text-[#525252]">
                                          ({rev.defect_class})
                                        </span>
                                        <span
                                          className={`text-[11px] font-mono uppercase px-2 py-0.5 font-semibold ${
                                            rev.severity === "high"
                                              ? "bg-[#da1e28] text-[#ffffff]"
                                              : rev.severity === "medium"
                                              ? "bg-[#f1c21b] text-[#161616]"
                                              : "bg-[#e0e0e0] text-[#161616]"
                                          }`}
                                        >
                                          Severity: {rev.severity}
                                        </span>
                                      </div>
                                      <p className="text-[13px] text-[#525252]">
                                        <strong className="text-[#161616]">Location hint: </strong>
                                        {rev.location_hint}
                                      </p>
                                    </div>

                                    {/* Confidence Indicator Bar */}
                                    {aiDefect && (
                                      <div className="min-w-[160px] text-right">
                                        <div className="flex items-center justify-between text-[12px] font-mono mb-1">
                                          <span className="text-[#525252]">AI confidence</span>
                                          <strong
                                            className={
                                              isLowConf ? "text-[#da1e28]" : "text-[#161616]"
                                            }
                                          >
                                            {confPct}% {isLowConf ? "(LOW)" : ""}
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

                                  {/* AI Visual Evidence & Recommended Action */}
                                  {aiDefect && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px] bg-[#f4f4f4] p-3 border border-[#e0e0e0]">
                                      <div>
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.32px] text-[#525252] block mb-0.5">
                                          Visual evidence
                                        </span>
                                        <p className="text-[#161616]">{aiDefect.evidence}</p>
                                      </div>
                                      <div>
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.32px] text-[#525252] block mb-0.5">
                                          Recommended next action
                                        </span>
                                        <p className="text-[#161616]">
                                          {aiDefect.recommended_action}
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Inspector Action Controls: Accept / Edit / Reject / Escalate */}
                                  {!isLocked && (
                                    <div className="space-y-3 pt-1">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-[12px] font-semibold text-[#161616]">
                                          Inspector decision for this finding:
                                        </span>
                                        {aiDefect === null && (
                                          <button
                                            type="button"
                                            onClick={() => removeHumanDefect(idx)}
                                            className="text-[12px] text-[#da1e28] flex items-center gap-1 hover:underline"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Remove added defect</span>
                                          </button>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {(
                                          [
                                            {
                                              act: "accept",
                                              label: "Accept",
                                              activeBg: "bg-[#24a148] text-[#ffffff] border-[#24a148]",
                                            },
                                            {
                                              act: "edit",
                                              label: "Edit class/loc",
                                              activeBg: "bg-[#0f62fe] text-[#ffffff] border-[#0f62fe]",
                                            },
                                            {
                                              act: "reject",
                                              label: "Reject (false call)",
                                              activeBg: "bg-[#da1e28] text-[#ffffff] border-[#da1e28]",
                                            },
                                            {
                                              act: "escalate",
                                              label: "Escalate",
                                              activeBg: "bg-[#f1c21b] text-[#161616] border-[#f1c21b]",
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
                                              className={`min-h-[44px] px-3 py-2 text-[13px] font-semibold border transition-colors ${
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

                                      {/* Show inline class/severity/location editors when 'edit' or human-added */}
                                      {(rev.action === "edit" || rev.ai_index === null) && (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                                          <div>
                                            <label className="block text-[11px] text-[#525252] mb-1">
                                              Confirmed defect class (6 allowed)
                                            </label>
                                            <select
                                              value={rev.defect_class}
                                              onChange={(e) =>
                                                updateDefectReview(idx, {
                                                  defect_class: e.target.value as DefectClass,
                                                })
                                              }
                                              className="carbon-input w-full text-[13px]"
                                            >
                                              {Object.entries(DEFECT_LABELS).map(([k, v]) => (
                                                <option key={k} value={k}>
                                                  {v} ({k})
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="block text-[11px] text-[#525252] mb-1">
                                              Confirmed severity
                                            </label>
                                            <select
                                              value={rev.severity}
                                              onChange={(e) =>
                                                updateDefectReview(idx, {
                                                  severity: e.target.value as Severity,
                                                })
                                              }
                                              className="carbon-input w-full text-[13px]"
                                            >
                                              <option value="low">low</option>
                                              <option value="medium">medium</option>
                                              <option value="high">high</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label className="block text-[11px] text-[#525252] mb-1">
                                              Location hint
                                            </label>
                                            <input
                                              type="text"
                                              value={rev.location_hint}
                                              onChange={(e) =>
                                                updateDefectReview(idx, {
                                                  location_hint: e.target.value,
                                                })
                                              }
                                              className="carbon-input w-full text-[13px]"
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

                        {/* Collapsible Raw JSON Drawer */}
                        <div className="border-t border-[#e0e0e0] pt-3">
                          <button
                            type="button"
                            onClick={() => setShowRawJson((v) => !v)}
                            className="text-[13px] font-mono text-[#0f62fe] flex items-center gap-1.5 hover:underline"
                          >
                            {showRawJson ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            <span>
                              {showRawJson
                                ? "Hide strict JSON schema payload"
                                : "Inspect strict Gemma 4 JSON schema output"}
                            </span>
                          </button>
                          {showRawJson && (
                            <pre className="mt-2 p-4 bg-[#161616] text-[#f4f4f4] font-mono text-[12px] overflow-x-auto max-h-[280px]">
                              {JSON.stringify(currentRecord.ai_result, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* STEP 4 CARD: FINAL HUMAN DISPOSITION & SIGN-OFF */}
                    {currentRecord.status !== "confirmed" &&
                    currentRecord.status !== "escalated" ? (
                      <div className="border border-[#e0e0e0] bg-[#ffffff]">
                        <div className="px-6 py-4 bg-[#f4f4f4] border-b border-[#e0e0e0]">
                          <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                            Step 4 of 5 · Mandatory human-in-the-loop gate
                          </span>
                          <h2 className="text-[20px] font-normal leading-[1.40] text-[#161616]">
                            Confirm final board disposition
                          </h2>
                        </div>

                        <div className="p-6 space-y-5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(["pass", "rework", "quarantine", "escalate"] as FinalDisposition[]).map(
                              (disp) => {
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
                                      <span className="text-[15px] font-semibold">
                                        {info.label}
                                      </span>
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
                              }
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[12px] tracking-[0.32px] text-[#525252] mb-1">
                                Verifying operator / QA reviewer
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
                                    {op}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[12px] tracking-[0.32px] text-[#525252] mb-1">
                                Operator disposition notes (optional)
                              </label>
                              <input
                                type="text"
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                className="carbon-input w-full text-[14px]"
                                placeholder="e.g., Confirmed bridge on U2 pins; routed to rework"
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
                              Both the original Gemma 4 output and your confirmed human decision will be stored in Supabase PostgreSQL.
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
                                  ? "Saving verified record..."
                                  : "Confirm final disposition & save record"}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* STEP 5 CARD: POST-CONFIRMATION SUMMARY & NEXT ACTIONS */
                      <div className="border border-[#24a148] bg-[#f4f4f4] p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-[20px] font-semibold text-[#161616]">
                              Quality record verified &amp; committed ({currentRecord.id})
                            </h3>
                            <p className="text-[14px] text-[#525252]">
                              Signed off by <strong>{currentRecord.reviewer_id}</strong> in{" "}
                              <strong>{currentRecord.doc_time_s ?? elapsedDocSec}s</strong> · Human-AI agreement:{" "}
                              <strong className="uppercase text-[#161616]">
                                {currentRecord.human_agreement}
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
                              <span>Inspect next board</span>
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
                              <span>View in quality log</span>
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
        {/* TAB 2: QUALITY RECORDS BROWSER & AUDIT DRAWER                       */}
        {/* =================================================================== */}
        {activeTab === "records" && (
          <div className="space-y-6">
            <div className="border border-[#e0e0e0] bg-[#ffffff] p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[14px] text-[#0f62fe] mb-1">
                  Traceability &amp; audit log · Supabase PostgreSQL + local mirror
                </p>
                <h1 className="text-[32px] font-light text-[#161616]">
                  Inspection quality records ({filteredRecords.length})
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center border border-[#e0e0e0] bg-[#f4f4f4]">
                  <Filter className="w-4 h-4 text-[#525252] ml-3 mr-1" />
                  {["all", "pending_review", "confirmed", "escalated"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setRecordStatusFilter(st)}
                      className={`min-h-[40px] px-3 py-1.5 text-[12px] tracking-[0.32px] ${
                        recordStatusFilter === st
                          ? "bg-[#0f62fe] text-[#ffffff] font-semibold"
                          : "text-[#161616] hover:bg-[#e0e0e0]"
                      }`}
                    >
                      {st.replace("_", " ")}
                    </button>
                  ))}
                </div>

                <a
                  href="/api/export/csv"
                  className="carbon-btn-primary !min-h-[40px] !py-2 flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Download CSV</span>
                </a>
                <a
                  href="/api/export/json"
                  className="carbon-btn-secondary !min-h-[40px] !py-2 flex items-center gap-1.5"
                >
                  <FileJson className="w-4 h-4" />
                  <span>Download JSON</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Records Table */}
              <div
                className={`${
                  selectedRecordDetail ? "lg:col-span-7" : "lg:col-span-12"
                } border border-[#e0e0e0] bg-[#ffffff] overflow-x-auto`}
              >
                {filteredRecords.length === 0 ? (
                  <div className="p-12 text-center text-[#525252] space-y-3">
                    <p className="text-[16px] text-[#161616]">
                      No inspection records match the current filter.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("inspect")}
                      className="carbon-btn-primary"
                    >
                      Go to inspect station
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#525252] text-[12px] tracking-[0.32px]">
                        <th className="p-3.5 font-semibold">Inspection ID</th>
                        <th className="p-3.5 font-semibold">Board / Station</th>
                        <th className="p-3.5 font-semibold">AI Source</th>
                        <th className="p-3.5 font-semibold">Status</th>
                        <th className="p-3.5 font-semibold">Final Disposition</th>
                        <th className="p-3.5 font-semibold">Agreement</th>
                        <th className="p-3.5 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e0e0e0]">
                      {filteredRecords.map((rec) => {
                        const isSelected = selectedRecordDetail?.id === rec.id;
                        return (
                          <tr
                            key={rec.id}
                            onClick={() => setSelectedRecordDetail(rec)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? "bg-[#f4f4f4]" : "hover:bg-[#f4f4f4]"
                            }`}
                          >
                            <td className="p-3.5 font-mono text-[12px] text-[#161616]">
                              <div>{rec.id}</div>
                              <div className="text-[11px] text-[#525252]">
                                {new Date(rec.created_at).toLocaleTimeString()}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <div className="font-semibold text-[#161616]">
                                {rec.board_id} (Rev {rec.board_revision})
                              </div>
                              <div className="text-[12px] text-[#525252]">{rec.line_station}</div>
                            </td>
                            <td className="p-3.5 font-mono text-[12px]">
                              {rec.ai_source}
                              <div className="text-[11px] text-[#525252]">
                                {rec.ai_latency_ms}ms
                              </div>
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`inline-block px-2 py-0.5 text-[11px] font-mono font-semibold uppercase ${
                                  rec.status === "confirmed"
                                    ? "bg-[#24a148] text-[#ffffff]"
                                    : rec.status === "escalated"
                                    ? "bg-[#f1c21b] text-[#161616]"
                                    : "bg-[#e0e0e0] text-[#161616]"
                                }`}
                              >
                                {rec.status}
                              </span>
                            </td>
                            <td className="p-3.5 font-mono uppercase font-semibold text-[#161616]">
                              {rec.final_disposition || "—"}
                            </td>
                            <td className="p-3.5 font-mono text-[12px]">
                              {rec.human_agreement || "pending"}
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
                                  className="px-2.5 py-1 bg-[#0f62fe] text-[#ffffff] text-[12px]"
                                >
                                  Resume review
                                </button>
                              ) : (
                                <span className="text-[12px] text-[#0f62fe] hover:underline">
                                  Inspect audit
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

              {/* Record Audit Detail Panel */}
              {selectedRecordDetail && (
                <div className="lg:col-span-5 border border-[#e0e0e0] bg-[#ffffff] p-6 space-y-4">
                  <div className="flex items-start justify-between border-b border-[#e0e0e0] pb-3">
                    <div>
                      <span className="text-[11px] font-mono text-[#525252]">
                        AUDIT RECORD TRACEABILITY
                      </span>
                      <h3 className="text-[20px] font-semibold text-[#161616]">
                        {selectedRecordDetail.id}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRecordDetail(null)}
                      className="text-[#525252] hover:text-[#161616]"
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
                          className="w-full max-h-[200px] object-contain mx-auto"
                        />
                      </div>
                    )}

                  <div className="grid grid-cols-2 gap-3 text-[12px] bg-[#f4f4f4] p-4 border border-[#e0e0e0]">
                    <div>
                      <span className="text-[#525252] block">Board ID</span>
                      <strong className="font-mono">{selectedRecordDetail.board_id}</strong>
                    </div>
                    <div>
                      <span className="text-[#525252] block">Shift</span>
                      <strong>{selectedRecordDetail.shift}</strong>
                    </div>
                    <div>
                      <span className="text-[#525252] block">Operator</span>
                      <strong>{selectedRecordDetail.operator_id}</strong>
                    </div>
                    <div>
                      <span className="text-[#525252] block">Reviewer</span>
                      <strong>{selectedRecordDetail.reviewer_id || "Pending"}</strong>
                    </div>
                    <div>
                      <span className="text-[#525252] block">Model &amp; Prompt</span>
                      <strong className="font-mono">
                        {selectedRecordDetail.model_id} ({selectedRecordDetail.prompt_version})
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#525252] block">Image SHA-256</span>
                      <strong className="font-mono">
                        {selectedRecordDetail.image_sha256
                          ? `${selectedRecordDetail.image_sha256.slice(0, 16)}...`
                          : "N/A"}
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-2 text-[13px]">
                    <h4 className="font-semibold text-[#161616]">
                      AI suggestion vs. Human confirmed decision
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 border border-[#e0e0e0] bg-[#f4f4f4]">
                        <span className="text-[11px] font-mono text-[#525252] block">
                          ORIGINAL AI SUGGESTION
                        </span>
                        <p className="font-mono font-semibold text-[#0f62fe] mt-1">
                          {selectedRecordDetail.original_ai_disposition ||
                            selectedRecordDetail.ai_result?.overall_disposition ||
                            "manual"}
                        </p>
                        <p className="text-[12px] text-[#525252] mt-1">
                          AI defects: {selectedRecordDetail.ai_result?.defects?.length || 0}
                        </p>
                      </div>
                      <div className="p-3 border border-[#e0e0e0] bg-[#f4f4f4]">
                        <span className="text-[11px] font-mono text-[#525252] block">
                          FINAL HUMAN DISPOSITION
                        </span>
                        <p className="font-mono font-semibold text-[#24a148] uppercase mt-1">
                          {selectedRecordDetail.final_disposition || "PENDING"}
                        </p>
                        <p className="text-[12px] text-[#525252] mt-1">
                          Confirmed defects: {selectedRecordDetail.final_defects?.length ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: LEAN SIX SIGMA (DMAIC) DASHBOARD                             */}
        {/* =================================================================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="border border-[#e0e0e0] bg-[#ffffff] p-6 lg:p-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[14px] text-[#0f62fe] mb-1">
                  Lean Six Sigma quality telemetry · Define · Measure · Analyze · Improve · Control
                </p>
                <h1 className="text-[32px] lg:text-[42px] font-light text-[#161616]">
                  SMT inspection DMAIC dashboard
                </h1>
              </div>
              <button
                type="button"
                onClick={fetchAllData}
                className="carbon-btn-tertiary flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh telemetry</span>
              </button>
            </div>

            {/* 8 KPI Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                  Total inspections logged
                </span>
                <p className="text-[36px] font-light text-[#161616] mt-1">
                  {stats?.counts.total ?? 0}
                </p>
                <span className="text-[12px] text-[#525252]">
                  {stats?.counts.human_verified ?? 0} human-verified
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#f4f4f4] p-5">
                <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                  Pending human review
                </span>
                <p className="text-[36px] font-light text-[#da1e28] mt-1">
                  {stats?.counts.pending_review ?? 0}
                </p>
                <span className="text-[12px] text-[#525252]">
                  Awaiting operator disposition sign-off
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                  AI suggestion precision
                </span>
                <p className="text-[36px] font-light text-[#0f62fe] mt-1">
                  {stats?.kpis.ai_precision_pct !== null &&
                  stats?.kpis.ai_precision_pct !== undefined
                    ? `${stats.kpis.ai_precision_pct}%`
                    : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  Accepted AI flags / total reviewed AI flags
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                  AI false-call rate
                </span>
                <p className="text-[36px] font-light text-[#161616] mt-1">
                  {stats?.kpis.false_call_rate_pct !== null &&
                  stats?.kpis.false_call_rate_pct !== undefined
                    ? `${stats.kpis.false_call_rate_pct}%`
                    : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  Rejected AI flags ({stats?.kpis.ai_flags_rejected ?? 0} false positives)
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                  AI recall proxy (sample set)
                </span>
                <p className="text-[36px] font-light text-[#24a148] mt-1">
                  {stats?.kpis.ai_recall_proxy_pct !== null &&
                  stats?.kpis.ai_recall_proxy_pct !== undefined
                    ? `${stats.kpis.ai_recall_proxy_pct}%`
                    : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  Human added missed defects: {stats?.kpis.human_added_defects ?? 0}
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                  Traceability completeness
                </span>
                <p className="text-[36px] font-light text-[#24a148] mt-1">
                  {stats?.kpis.traceability_completeness_pct ?? 100}%
                </p>
                <span className="text-[12px] text-[#525252]">
                  Records with hash, model, prompt, operator &amp; disposition
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                  Avg documentation time
                </span>
                <p className="text-[36px] font-light text-[#161616] mt-1">
                  {stats?.kpis.avg_doc_time_s ? `${stats.kpis.avg_doc_time_s}s` : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  Capture to human disposition sign-off
                </span>
              </div>

              <div className="border border-[#e0e0e0] bg-[#ffffff] p-5">
                <span className="text-[12px] tracking-[0.32px] text-[#525252] block">
                  Avg Gemma 4 latency
                </span>
                <p className="text-[36px] font-light text-[#0f62fe] mt-1">
                  {stats?.kpis.avg_ai_latency_ms ? `${stats.kpis.avg_ai_latency_ms}ms` : "—"}
                </p>
                <span className="text-[12px] text-[#525252]">
                  Multimodal inference round-trip
                </span>
              </div>
            </div>

            {/* Pareto & Breakdown Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Defect Pareto Chart */}
              <div className="border border-[#e0e0e0] bg-[#ffffff] p-6 space-y-4">
                <div>
                  <span className="text-[12px] text-[#525252] block">
                    DMAIC Analyze · Confirmed defect taxonomy Pareto
                  </span>
                  <h2 className="text-[20px] font-normal text-[#161616]">
                    Defect distribution across 6 MVP classes
                  </h2>
                </div>
                <div className="space-y-3">
                  {(stats?.pareto_defects || []).map((item) => {
                    const maxCount = Math.max(
                      1,
                      ...(stats?.pareto_defects.map((d) => d.count) || [1])
                    );
                    const widthPct = Math.round((item.count / maxCount) * 100);
                    return (
                      <div key={item.defect_class} className="space-y-1">
                        <div className="flex justify-between text-[13px]">
                          <span className="font-mono text-[#161616]">{item.defect_class}</span>
                          <strong className="font-mono text-[#161616]">{item.count}</strong>
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

              {/* Disposition & Agreement Breakdown */}
              <div className="border border-[#e0e0e0] bg-[#ffffff] p-6 space-y-6">
                <div>
                  <span className="text-[12px] text-[#525252] block">
                    DMAIC Control · Human verification &amp; disposition mix
                  </span>
                  <h2 className="text-[20px] font-normal text-[#161616]">
                    Confirmed dispositions &amp; operator agreement
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(["pass", "rework", "quarantine", "escalate"] as const).map((d) => (
                    <div key={d} className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                      <span className="text-[11px] font-mono uppercase text-[#525252] block">
                        {d}
                      </span>
                      <strong className="text-[24px] font-light text-[#161616]">
                        {stats?.disposition_counts?.[d] ?? 0}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#e0e0e0]">
                  {(["agree", "partial", "disagree"] as const).map((ag) => (
                    <div key={ag} className="p-3 bg-[#f4f4f4] border border-[#e0e0e0]">
                      <span className="text-[11px] font-mono uppercase text-[#525252] block">
                        Human {ag}
                      </span>
                      <strong className="text-[22px] font-light text-[#161616]">
                        {stats?.agreement_counts?.[ag] ?? 0}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* DMAIC Methodology Alignment Card */}
            <div className="border border-[#e0e0e0] bg-[#f4f4f4] p-6 space-y-3">
              <h3 className="text-[18px] font-semibold text-[#161616]">
                Lean Six Sigma (DMAIC) alignment &amp; scope boundary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-[13px]">
                <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                  <strong className="text-[#0f62fe] block mb-1">Define</strong>
                  Manual paper/chat PCB defect logs in Tier-2/3 lines and SMK labs lack standardized taxonomy and traceability.
                </div>
                <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                  <strong className="text-[#0f62fe] block mb-1">Measure</strong>
                  Captures documentation time (s), AI precision, false-call rate, and 100% audit field completeness.
                </div>
                <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                  <strong className="text-[#0f62fe] block mb-1">Analyze</strong>
                  Stratifies confirmed defects by class Pareto, severity, board ID, line/station, operator, and shift.
                </div>
                <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                  <strong className="text-[#0f62fe] block mb-1">Improve</strong>
                  Gemma 4 multimodal inference standardizes the 6-class taxonomy and accelerates structured defect logging.
                </div>
                <div className="p-3 bg-[#ffffff] border border-[#e0e0e0]">
                  <strong className="text-[#0f62fe] block mb-1">Control</strong>
                  Enforces mandatory human disposition sign-off, SHA-256 image hashing, versioned prompts, and rejected-flag feedback.
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Carbon Inverted Footer (#161616 inverse-canvas, the only dark surface per docs/DESIGN.md) */}
      <footer className="bg-[#161616] text-[#c6c6c6] px-4 lg:px-8 py-12 mt-12 border-t border-[#262626]">
        <div className="max-w-[1584px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-[14px] leading-[1.29] tracking-[0.16px]">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#ffffff] font-semibold">
              <span className="inline-block w-3 h-3 bg-[#0f62fe]" />
              <span>AOI-Lite Batam</span>
            </div>
            <p className="text-[12px] text-[#c6c6c6] leading-[1.5]">
              Open-source human-in-the-loop SMT/PCBA visual inspection &amp; quality-record system powered by multimodal Google Gemma 4.
            </p>
          </div>

          <div className="space-y-1.5 text-[12px]">
            <p className="text-[#ffffff] font-semibold mb-2">Architecture &amp; Stack</p>
            <p>Next.js App Router (Unified SPA + API)</p>
            <p>Google Gemma 4 ({config?.model_id || "gemma-4-26b-a4b-it"})</p>
            <p>Supabase PostgreSQL (`public.aoi_inspections`)</p>
            <p>IBM Carbon Design System (`docs/DESIGN.md`)</p>
          </div>

          <div className="space-y-1.5 text-[12px]">
            <p className="text-[#ffffff] font-semibold mb-2">Quality &amp; Safety Boundaries</p>
            <p>Strictly 6 visible SMT/PCB defect classes</p>
            <p>Mandatory human confirmation on all records</p>
            <p>Hidden BGA/QFN solder joints require X-ray</p>
            <p>Zero autonomous pass/fail release decisions</p>
          </div>

          <div className="space-y-1.5 text-[12px]">
            <p className="text-[#ffffff] font-semibold mb-2">Hacktoberfest Hack Day Batam</p>
            <p>Kota Batam × Batam Innovation Center</p>
            <p>License: MIT Open Source</p>
            <p className="font-mono text-[11px] text-[#8c8c8c]">
              Prompt: {config?.prompt_version || "aoi-prompt-v1.0"} ({config?.prompt_sha256 || "sha256"})
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
