import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const labelsPath = path.join(process.cwd(), "sample_data", "labels.json");
  const cacheDir = path.join(process.cwd(), "sample_data", "cached_responses");

  if (!fs.existsSync(labelsPath)) {
    return NextResponse.json({ samples: [] });
  }

  try {
    const data = JSON.parse(fs.readFileSync(labelsPath, "utf-8")) as {
      samples?: Array<Record<string, unknown> & { id: string }>;
    };
    const samples = (data.samples || []).map((s) => ({
      ...s,
      has_cache: fs.existsSync(path.join(cacheDir, `${s.id}.json`)),
    }));
    return NextResponse.json({ samples });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ samples: [], error: msg }, { status: 500 });
  }
}

