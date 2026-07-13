import { config } from "dotenv";
config({ path: ".env.local" });

// Pace Gemini calls to stay under the free-tier 20 req/min (avoid HTTP 429).
process.env.GEMINI_THROTTLE_MS = "4000";

import { query } from "../src/lib/query";
import { evaluateAll, type CombinedEvalResult } from "../src/lib/eval";
import { scoreTrace } from "../src/lib/observability";
import { goldenQA } from "../data/golden-qa";

/**
 * Golden-set regression eval (Option B).
 * Runs every golden Q&A through the REAL RAG pipeline, then grades each answer on:
 *   - faithfulness    (answer grounded in retrieved context)
 *   - answer_relevance (answer addresses the question)
 *   - correctness     (answer covers expected key facts vs golden)
 * All three are graded in ONE combined LLM call (evaluateAll) to keep the call budget
 * low on the free tier: 3 calls/item (embed, generate, combined-judge) instead of 5.
 * Reports per-item scores + averages, and verifies the three scores land in Langfuse.
 *
 * Usage: npx tsx scripts/test-golden.ts
 */
interface Row {
  question: string;
  sources: number;
  faithfulness: number;
  answerRelevance: number;
  correctness: number;
  missingFacts: string[];
}

async function main() {
  console.log(`→ golden set: ${goldenQA.length} Q&A\n`);
  const rows: Row[] = [];
  let lastTraceId: string | undefined;

  for (let i = 0; i < goldenQA.length; i++) {
    const item = goldenQA[i];
    process.stdout.write(`[${i + 1}/${goldenQA.length}] ${item.question}\n  → `);

    // skipEval=true: the golden run grades faithfulness+relevance+correctness itself
    // in one combined call, so we don't pay for the per-request judges twice.
    const result = await query(item.question, { skipEval: true });
    if (!result.answer || result.sources.length === 0) {
      console.error(`\n✗ no answer/sources for: ${item.question}`);
      process.exit(1);
    }

    const all: CombinedEvalResult = await evaluateAll(
      item.question,
      result.answer,
      result.sources.map((s) => s.content),
      item.expectedAnswer,
    );

    // Push all three onto the same Langfuse trace. Best-effort, never blocks.
    if (result.traceId) {
      await Promise.all([
        scoreTrace(result.traceId, "faithfulness", all.faithfulness.score, all.faithfulness.reasoning).catch(() => {}),
        scoreTrace(result.traceId, "answer_relevance", all.answerRelevance.score, all.answerRelevance.reasoning).catch(() => {}),
        scoreTrace(result.traceId, "correctness", all.correctness.score, all.correctness.reasoning).catch(() => {}),
      ]);
      lastTraceId = result.traceId;
    }

    const f = all.faithfulness.score;
    const ar = all.answerRelevance.score;
    const c = all.correctness.score;
    rows.push({
      question: item.question,
      sources: result.sources.length,
      faithfulness: f,
      answerRelevance: ar,
      correctness: c,
      missingFacts: all.correctness.missingFacts,
    });
    console.log(
      `faith=${Math.round(f * 100)}% rel=${Math.round(ar * 100)}% corr=${Math.round(
        c * 100,
      )}% (sources=${result.sources.length})`,
    );
  }

  const avg = (sel: (r: Row) => number) => rows.reduce((s, r) => s + sel(r), 0) / rows.length;
  console.log("\n=== GOLDEN SET SUMMARY ===");
  console.log(`items:             ${rows.length}`);
  console.log(`avg faithfulness:  ${Math.round(avg((r) => r.faithfulness) * 100)}%`);
  console.log(`avg relevance:     ${Math.round(avg((r) => r.answerRelevance) * 100)}%`);
  console.log(`avg correctness:   ${Math.round(avg((r) => r.correctness) * 100)}%`);

  const low = rows.filter((r) => r.correctness < 0.7);
  if (low.length) {
    console.log("\n⚠ low correctness (<70%) — possible regression:");
    low.forEach((r) => {
      console.log(` - ${r.question}`);
      r.missingFacts.forEach((m) => console.log(`     missing: ${m}`));
    });
  }

  if (!lastTraceId) {
    console.log("\n⚠ no traceId (Langfuse not configured) — skipping score verification.");
    return;
  }

  console.log(`\n→ verifying scores on trace ${lastTraceId} in Langfuse...`);
  await new Promise((r) => setTimeout(r, 8000));

  const base =
    process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || "https://cloud.langfuse.com";
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!pk || !sk) {
    console.log("⚠ Langfuse keys missing — cannot verify scores.");
    return;
  }
  const auth = Buffer.from(`${pk}:${sk}`).toString("base64");
  const resp = await fetch(`${base.replace(/\/$/, "")}/api/public/scores?traceId=${lastTraceId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!resp.ok) {
    console.error(`✗ Langfuse scores API ${resp.status}`);
    process.exit(1);
  }
  const json = (await resp.json()) as { data?: Array<{ name: string; value: number }> };
  const names = (json.data ?? []).map((s) => s.name);
  for (const n of ["faithfulness", "answer_relevance", "correctness"]) {
    if (names.includes(n)) console.log(`✓ VERIFIED — "${n}" score attached to trace.`);
    else console.log(`⚠ "${n}" not yet visible (ingestion lag). Check Langfuse dashboard.`);
  }
}

main().catch((e) => {
  console.error("✗ golden eval failed:", e);
  process.exit(1);
});
