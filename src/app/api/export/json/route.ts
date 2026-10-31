import { listInspectionRecords } from "@/lib/storage";

export async function GET() {
  const { records, storage_backend } = await listInspectionRecords(1000);
  const payload = {
    exported_at: new Date().toISOString(),
    project: "AOI-Lite Batam",
    storage_backend,
    record_count: records.length,
    records,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aoi-lite-batam-records.json"`,
    },
  });
}

