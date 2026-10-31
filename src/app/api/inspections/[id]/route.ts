import { NextResponse } from "next/server";
import { getInspectionRecord } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = await getInspectionRecord(id);
  if (!record) {
    return NextResponse.json({ error: `Inspection '${id}' not found` }, { status: 404 });
  }
  return NextResponse.json({ inspection: record });
}

