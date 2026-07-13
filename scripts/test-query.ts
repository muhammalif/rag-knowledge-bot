import { config } from "dotenv";
config({ path: ".env.local" });

import { query } from "../src/lib/query";

/**
 * Integration test for the RAG query path (Step 3).
 *   npx tsx scripts/test-query.ts
 *
 * Requires: GEMINI_API_KEY + Supabase env (real calls).
 * Asserts: answer non-empty, sources present, each source well-formed, similarity in (0,1].
 */
async function main() {
  const question = "Apa saja stack utama yang dipakai di proyek RAG knowledge bot ini?";
  console.log("Q:", question, "\n");

  const { answer, sources } = await query(question, { k: 4 });

  console.log("ANSWER:\n" + answer + "\n");
  console.log("SOURCES:", sources.length);
  for (const s of sources) {
    console.log(` - ${s.source} [chunk ${s.chunk_index}] sim=${s.similarity.toFixed(4)} (${s.id})`);
  }

  const fails: string[] = [];
  if (!answer || answer.trim().length === 0) fails.push("answer empty");
  if (sources.length === 0) fails.push("no sources returned");
  for (const s of sources) {
    if (!s.id) fails.push("source missing id");
    if (typeof s.source !== "string") fails.push("source.source not string");
    if (typeof s.chunk_index !== "number") fails.push("source.chunk_index not number");
    if (!(s.similarity > 0 && s.similarity <= 1)) fails.push(`source.similarity out of (0,1]: ${s.similarity}`);
  }

  if (fails.length) {
    console.error("\nFAIL:", fails.join("; "));
    process.exit(1);
  }
  console.log("\nPASS — answer non-empty, sources present & well-formed.");
}

main().catch((e) => {
  console.error("Query test failed:", e);
  process.exit(1);
});
