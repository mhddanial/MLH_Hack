import { listInspectionRecords } from "@/lib/storage";

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).replace(/\r?\n/g, " ");
  if (s.includes(",") || s.includes('"') || s.includes(";")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const { records } = await listInspectionRecords(1000);

  const headers = [
    "inspection_id",
    "created_at",
    "shift",
    "board_id",
    "board_revision",
    "line_station",
    "operator_id",
    "inspection_type",
    "image_filename",
    "image_sha256",
    "model_id",
    "prompt_version",
    "ai_source",
    "ai_overall_disposition",
    "ai_defect_class",
    "ai_confidence",
    "ai_severity",
    "ai_location_hint",
    "ai_evidence",
    "human_action",
    "final_defect_class",
    "final_severity",
    "final_disposition",
    "human_agreement",
    "reviewer_id",
    "reviewed_at",
    "doc_time_s",
    "status",
  ];

  const rows: string[] = [headers.join(",")];

  for (const r of records) {
    const aiDefects = r.ai_result?.defects || [];
    const reviews = r.defect_reviews || [];

    if (reviews.length > 0) {
      for (const rev of reviews) {
        const aiDef =
          rev.ai_index !== null && rev.ai_index !== undefined
            ? aiDefects[rev.ai_index]
            : null;
        rows.push(
          [
            r.id,
            r.created_at,
            r.shift,
            r.board_id,
            r.board_revision,
            r.line_station,
            r.operator_id,
            r.inspection_type,
            r.image_filename,
            r.image_sha256,
            r.model_id,
            r.prompt_version,
            r.ai_source,
            r.ai_result?.overall_disposition || "",
            aiDef?.defect_class || "",
            aiDef ? aiDef.confidence.toFixed(2) : "",
            aiDef?.severity || "",
            aiDef?.location_hint || rev.location_hint || "",
            aiDef?.evidence || "",
            rev.action,
            rev.action === "reject" ? "rejected_false_call" : rev.defect_class,
            rev.severity,
            r.final_disposition || "",
            r.human_agreement || "",
            r.reviewer_id || "",
            r.reviewed_at || "",
            r.doc_time_s ?? "",
            r.status,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    } else if (aiDefects.length > 0) {
      for (const aiDef of aiDefects) {
        rows.push(
          [
            r.id,
            r.created_at,
            r.shift,
            r.board_id,
            r.board_revision,
            r.line_station,
            r.operator_id,
            r.inspection_type,
            r.image_filename,
            r.image_sha256,
            r.model_id,
            r.prompt_version,
            r.ai_source,
            r.ai_result?.overall_disposition || "",
            aiDef.defect_class,
            aiDef.confidence.toFixed(2),
            aiDef.severity,
            aiDef.location_hint,
            aiDef.evidence,
            "pending",
            "",
            "",
            r.final_disposition || "",
            r.human_agreement || "",
            r.reviewer_id || "",
            r.reviewed_at || "",
            r.doc_time_s ?? "",
            r.status,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    } else {
      rows.push(
        [
          r.id,
          r.created_at,
          r.shift,
          r.board_id,
          r.board_revision,
          r.line_station,
          r.operator_id,
          r.inspection_type,
          r.image_filename,
          r.image_sha256,
          r.model_id,
          r.prompt_version,
          r.ai_source,
          r.ai_result?.overall_disposition || "pass",
          "none",
          "",
          "",
          "",
          "",
          r.status === "confirmed" ? "accept_clean" : "pending",
          "none",
          "",
          r.final_disposition || "",
          r.human_agreement || "",
          r.reviewer_id || "",
          r.reviewed_at || "",
          r.doc_time_s ?? "",
          r.status,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }

  return new Response(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aoi-lite-batam-records.csv"`,
    },
  });
}

