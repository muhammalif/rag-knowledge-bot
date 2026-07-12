import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { getSupabase } from "./supabase";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
// gemini-embedding-001 → 3072-dim. NOTE: `text-embedding-004` / `embedding-001`
// both 404 on embedContent for this key; gemini-embedding-001 is what works.
// 3072-d exceeds pgvector's 2000-dim ANN-index limit, so we use exact cosine
// search (no ivfflat/hnsw index) — fine for demo-scale retrieval.
const EMBEDDING_MODEL = "gemini-embedding-001";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
});

function getEmbeddings(): GoogleGenerativeAIEmbeddings {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment");
  }
  return new GoogleGenerativeAIEmbeddings({
    model: EMBEDDING_MODEL,
    apiKey,
  });
}

export interface IngestResult {
  source: string;
  chunks: number;
  inserted: number;
}

/**
 * Ingest a single document into the pgvector store.
 *
 * Pipeline: split → embed (Gemini gemini-embedding-001, 3072-d) → insert rows
 * { content, embedding, metadata{source, chunk_index} }.
 * `embedding` is sent as a plain number[] — Supabase/PostgREST casts it to the
 * `vector(3072)` column. If you hit "malformed array literal", switch to a string
 * literal: `\[${vectors[i].join(",")}\]`.
 */
export async function ingestDocument(
  text: string,
  source: string,
): Promise<IngestResult> {
  if (!text.trim()) {
    return { source, chunks: 0, inserted: 0 };
  }

  const docs: Document[] = await splitter.createDocuments([text], [{ source }]);

  const embeddings = getEmbeddings();
  const vectors = await embeddings.embedDocuments(
    docs.map((d) => d.pageContent),
  );

  const rows = docs.map((doc, i) => ({
    content: doc.pageContent,
    embedding: vectors[i],
    // `source` + `chunk_index` live inside the `metadata` jsonb column
    // (see docs/Database.md — `documents` has no standalone source/chunk_index cols).
    metadata: { source, chunk_index: i },
  }));

  const supabase = getSupabase();
  const { error } = await supabase.from("documents").insert(rows);

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return { source, chunks: docs.length, inserted: rows.length };
}
