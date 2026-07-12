import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

/**
 * Local unit test for the chunking step (no network / no credentials needed).
 * Proves RecursiveCharacterTextSplitter produces sane overlapping chunks.
 *   npx tsx scripts/test-split.ts
 */
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

const sample = Array.from({ length: 12 }, (_, i) =>
  `Paragraph ${i + 1}. ` +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(8),
).join("\n\n");

async function main() {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const docs = await splitter.createDocuments([sample], [{ source: "unit-test" }]);

  console.log(`Input chars: ${sample.length}`);
  console.log(`Chunks: ${docs.length}`);

  let ok = true;
  docs.forEach((d, i) => {
    const len = d.pageContent.length;
    const within = len <= CHUNK_SIZE + CHUNK_OVERLAP;
    if (!within) ok = false;
    console.log(`  chunk ${i}: ${len} chars ${within ? "OK" : "TOO BIG"}`);
  });

  // Overlap sanity: adjacent chunks should share a tail/head when >1 chunk.
  if (docs.length > 1) {
    const a = docs[0].pageContent;
    const b = docs[1].pageContent;
    const overlapFound = b.includes(a.slice(-CHUNK_OVERLAP / 2));
    console.log(`Overlap present between chunk 0→1: ${overlapFound ? "yes" : "no"}`);
    if (!overlapFound) ok = false;
  }

  if (ok && docs.length >= 1) {
    console.log("\nPASS — chunking works (size bound + overlap OK).");
  } else {
    console.error("\nFAIL — chunking produced unexpected output.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("test-split failed:", e);
  process.exit(1);
});
