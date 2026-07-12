import { config } from "dotenv";
// Load .env.local BEFORE anything reads process.env (dotenv ignores .env.local by default).
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestDocument } from "../src/lib/ingest";

/**
 * Seed a markdown/text file into the vector store.
 *   npx tsx scripts/seed.ts [path]   # default: interview_prep_master.md (project root)
 */
async function main() {
  const filePath = process.argv[2] ?? "interview_prep_master.md";
  const abs = resolve(process.cwd(), filePath);

  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch (e) {
    console.error(`Cannot read ${abs}: ${(e as Error).message}`);
    console.error(
      "Tip: copy it first (`cp ~/Desktop/interview_prep_master.md ./`) or pass the path: npx tsx scripts/seed.ts <path>",
    );
    process.exit(1);
  }

  console.log(`Ingesting ${abs} (${text.length} chars)...`);
  const result = await ingestDocument(text, filePath);
  console.log("Done:", result);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
