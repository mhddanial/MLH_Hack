import { NextResponse } from "next/server";
import { ReviewRequestSchema } from "@/lib/schema";
import { saveHumanReview } from "@/lib/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid human review payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await saveHumanReview(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: `Inspection '${id}' not found` }, { status: 404 });
  }

  return NextResponse.json({ inspection: updated });
}

