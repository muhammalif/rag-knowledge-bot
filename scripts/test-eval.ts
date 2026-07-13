import { config } from "dotenv";
config({ path: ".env.local" });

import { query } from "../src/lib/query";

/**
 * End-to-end faithfulness check (Step 6).
 * Runs a real RAG query, grades the answer with an LLM judge, and verifies the
 * faithfulness score lands in Langfuse (closes the observability loop).
 *
 * Usage: npx tsx scripts/test-eval.ts
 */
async function main() {
  const question = "Apa itu context engineering?";
  console.log(`→ query: "${question}"`);

  const result = await query(question);
  console.log(`✓ answer (${result.answer.length} chars)`);
  console.log(`✓ sources: ${result.sources.length}`);

  if (!result.faithfulness) {
    console.error("✗ no faithfulness result");
    process.exit(1);
  }
  console.log(
    `✓ faithfulness: ${(result.faithfulness.score * 100).toFixed(0)}% (faithful=${result.faithfulness.faithful})`,
  );
  if (result.faithfulness.unsupportedClaims.length) {
    console.log("  unsupported claims:");
    result.faithfulness.unsupportedClaims.forEach((c) => console.log(`   - ${c}`));
  }
  console.log(`  reasoning: ${result.faithfulness.reasoning}`);

  const traceId = result.traceId;
  if (!traceId) {
    console.log("⚠ no traceId (Langfuse not configured) — skipping score verification.");
    return;
  }

  // Wait for the trace + score to be ingested, then confirm the score arrived.
  console.log(`→ scoring trace ${traceId} in Langfuse (faithfulness)...`);
  await new Promise((r) => setTimeout(r, 8000));

  const base =
    process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || "https://cloud.langfuse.com";
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!pk || !sk) {
    console.log("⚠ Langfuse keys missing — cannot verify score.");
    return;
  }
  const auth = Buffer.from(`${pk}:${sk}`).toString("base64");
  const resp = await fetch(
    `${base.replace(/\/$/, "")}/api/public/scores?traceId=${traceId}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!resp.ok) {
    console.error(`✗ Langfuse scores API ${resp.status}`);
    process.exit(1);
  }
  const json = (await resp.json()) as { data?: Array<{ name: string; value: number }> };
  const score = (json.data ?? []).find((s) => s.name === "faithfulness");
  if (score) {
    console.log(`✓ VERIFIED — faithfulness score ${score.value} attached to trace in Langfuse.`);
  } else {
    console.log("⚠ faithfulness score not yet visible (ingestion lag). Check Langfuse dashboard.");
  }
}

main().catch((e) => {
  console.error("✗ eval failed:", e);
  process.exit(1);
});
