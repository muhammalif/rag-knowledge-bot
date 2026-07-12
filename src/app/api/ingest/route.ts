import { NextRequest, NextResponse } from "next/server";
import { ingestDocument } from "@/lib/ingest";

// Node runtime required: uses @supabase/supabase-js + Gemini SDK (no Edge APIs).
export const runtime = "nodejs";
// Never cache ingestion — always run per request.
export const dynamic = "force-dynamic";

interface IngestBody {
  text?: string;
  source?: string;
}

/**
 * POST /api/ingest
 * Body: { text: string, source?: string }
 * Returns: { source, chunks, inserted } (201) or { error } (400/500).
 *
 * File-based ingestion is handled by `scripts/seed.ts` (local, reads from disk).
 */
export async function POST(req: NextRequest) {
  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, source } = body;

  if (!text || !text.trim()) {
    return NextResponse.json(
      { error: "Provide `text` (non-empty) in the request body" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestDocument(text, source ?? "unknown");
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
