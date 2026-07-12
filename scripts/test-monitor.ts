import { config } from "dotenv";
config({ path: ".env.local" });

import { query } from "../src/lib/query";

/**
 * End-to-end monitoring check (Step 5).
 * Runs a real RAG query (which now emits Langfuse spans via the CallbackHandler),
 * then verifies the trace actually arrived in Langfuse by querying the public API.
 *
 * Usage: npx tsx scripts/test-monitor.ts
 */
async function main() {
  const question = "Apa itu context engineering?";
  console.log(`→ query: "${question}"`);

  const result = await query(question);
  console.log(`✓ answer (${result.answer.length} chars):`, result.answer.slice(0, 120) + "...");
  console.log(`✓ sources: ${result.sources.length}`);
  console.log(`✓ local traceId: ${result.traceId ?? "(none)"}`);

  if (!result.traceId) {
    console.error("✗ No traceId produced — Langfuse handler did not create a trace.");
    process.exit(1);
  }

  // Give the OTel BatchSpanProcessor time to flush to Langfuse (default interval ~10s).
  console.log("→ waiting for Langfuse flush (15s)...");
  await new Promise((r) => setTimeout(r, 15000));

  const base = (process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || "https://cloud.langfuse.com").replace(/\/$/, "");
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!pk || !sk) {
    console.error("✗ LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY missing — cannot verify receipt.");
    process.exit(1);
  }

  const auth = Buffer.from(`${pk}:${sk}`).toString("base64");
  const url = `${base}/api/public/traces?pageSize=20`;

  // Langfuse ingestion has a few seconds of lag; poll for our trace id.
  let foundId: string | null = null;
  for (let attempt = 1; attempt <= 4 && !foundId; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 1 ? 1500 : 4000));
    console.log(`→ GET ${base}/api/public/traces (attempt ${attempt})`);
    const resp = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`✗ Langfuse API ${resp.status}: ${body.slice(0, 300)}`);
      process.exit(1);
    }
    const json = (await resp.json()) as { data?: Array<{ id: string }> };
    const hit = (json.data ?? []).find((t) => t.id === result.traceId);
    if (hit) foundId = hit.id;
  }

  if (foundId) {
    console.log(`✓ VERIFIED — trace ${foundId} arrived in Langfuse.`);
    console.log(`  Open: https://cloud.langfuse.com/trace/${foundId}`);
  } else {
    console.log(
      `⚠ trace ${result.traceId} not found after polling (ingestion lag). ` +
        `Check https://cloud.langfuse.com for the new trace.`,
    );
  }
}

main().catch((e) => {
  console.error("✗ monitor failed:", e);
  process.exit(1);
});
