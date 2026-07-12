import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/query";

// Node runtime required: uses @supabase/supabase-js + Gemini SDK (no Edge APIs).
export const runtime = "nodejs";
// Never cache queries — always run per request against fresh retrieval.
export const dynamic = "force-dynamic";

interface QueryBody {
  question?: string;
  k?: number;
}

/**
 * POST /api/query
 * Body: { question: string, k?: number }
 * Returns: { answer: string, sources: Source[] } (200) or { error } (400/500).
 *
 * `sources` are the real retrieved chunks (faithful citations), not LLM-invented.
 */
export async function POST(req: NextRequest) {
  let body: QueryBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { question, k } = body;

  if (!question || !question.trim()) {
    return NextResponse.json(
      { error: "Provide `question` (non-empty) in the request body" },
      { status: 400 },
    );
  }

  try {
    const result = await query(question, k);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
