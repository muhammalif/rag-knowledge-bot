import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabase } from "../src/lib/supabase";

/**
 * Acceptance test for Step 2 (Ingest).
 * Asserts the most recently ingested rows have non-null 3072-d embeddings and
 * that `source`/`chunk_index` are stored inside the `metadata` jsonb column.
 *   npx tsx scripts/test-ingest.ts
 * Requires a successful `npx tsx scripts/seed.ts` run first.
 */
async function main() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("metadata, embedding, content")
    .order("id", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error("FAIL: `documents` is empty. Run `npx tsx scripts/seed.ts` first.");
    process.exit(1);
  }

  let ok = true;
  for (const row of data) {
    // Supabase/PostgREST returns `vector` columns as a JSON string, not number[].
    const embRaw = row.embedding as number[] | string | null;
    const emb = typeof embRaw === "string" ? JSON.parse(embRaw) : embRaw;
    const dim = Array.isArray(emb) ? emb.length : 0;
    const meta = (row.metadata ?? {}) as { source?: string; chunk_index?: number };
    const contentLen = row.content?.length ?? 0;
    const pass = emb !== null && dim === 3072 && contentLen > 0;
    if (!pass) ok = false;
    console.log(
      `• ${meta.source ?? "?"} [chunk ${meta.chunk_index ?? "?"}] dim=${dim} content=${contentLen}ch → ${pass ? "OK" : "BAD"}`,
    );
  }

  if (ok) {
    console.log(
      `\nPASS — ${data.length} rows, all embeddings non-null & 3072-d, metadata present.`,
    );
  } else {
    console.error("\nFAIL — some rows have null/wrong-dim embeddings or empty content.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("test-ingest failed:", e);
  process.exit(1);
});
