import { NextResponse } from "next/server";
import { listInspectionRecords } from "@/lib/storage";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const limit = Number(searchParams.get("limit") || "100");

  const { records, storage_backend } = await listInspectionRecords(limit);
  const filtered =
    statusFilter && statusFilter !== "all"
      ? records.filter((r) => r.status === statusFilter)
      : records;

  return NextResponse.json({
    records: filtered,
    storage_backend,
  });
}

