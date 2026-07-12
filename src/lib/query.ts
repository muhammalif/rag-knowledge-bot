import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGoogle } from "@langchain/google";
import { getSupabase } from "./supabase";
import { getHandler } from "./observability";

// Same embedding model as ingest (gemini-embedding-001 → 3072-d). See src/lib/ingest.ts.
const EMBEDDING_MODEL = "gemini-embedding-001";
// `gemini-flash-latest` = alias to the current stable Flash (free tier).
// NOTE: `gemini-2.5-flash` is no longer available to new API keys — use the alias
// so the model stays current without code changes.
const CHAT_MODEL = "gemini-flash-latest";

const TOP_K = 4;

export interface Source {
  id: string;
  source: string;
  chunk_index: number;
  similarity: number;
  content: string;
}

export interface QueryResult {
  answer: string;
  sources: Source[];
  traceId?: string;
}

function getEmbeddings(): GoogleGenerativeAIEmbeddings {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment");
  return new GoogleGenerativeAIEmbeddings({ model: EMBEDDING_MODEL, apiKey });
}

function getChat() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment");
  return new ChatGoogle({ model: CHAT_MODEL, apiKey });
}

/**
 * Retrieve-then-generate RAG query.
 *
 * 1. Embed the question (gemini-embedding-001, 3072-d).
 * 2. Retrieve top-K chunks via `match_docs` RPC (exact cosine scan, vector(3072)).
 * 3. Ground the LLM answer on the retrieved context; instruct inline [[n]] citations.
 * 4. Return { answer, sources } — `sources` are the REAL retrieved chunks, so citations
 *    are faithful (not hallucinated by the model).
 */
export async function query(question: string, k: number = TOP_K): Promise<QueryResult> {
  if (!question.trim()) {
    return { answer: "", sources: [] };
  }

  const handler = getHandler({ sessionId: crypto.randomUUID(), tags: ["query"] });

  const embeddings = getEmbeddings();
  const qVec = await embeddings.embedQuery(question);

  const supabase = getSupabase();
  // `q` is type `vector` — pass a vector literal string so PostgREST casts it correctly.
  const { data, error } = await supabase.rpc("match_docs", {
    q: `[${qVec.join(",")}]`,
    k,
  });

  if (error) {
    throw new Error(`match_docs RPC failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    content: string;
    metadata: { source?: string; chunk_index?: number };
    similarity: number;
  }>;

  if (rows.length === 0) {
    return {
      answer:
        "I don't have any documents indexed yet. Upload a document first (POST /api/ingest or the UI).",
      sources: [],
    };
  }

  const context = rows
    .map(
      (r, i) =>
        `[[${i + 1}]] (source: ${r.metadata?.source ?? "unknown"}, chunk ${
          r.metadata?.chunk_index ?? "?"
        })\n${r.content}`,
    )
    .join("\n\n");

  const system = `You are a precise RAG assistant. Answer the user's question using ONLY the provided context passages. Cite the passages you used inline with their [[n]] marker. If the context does not contain the answer, say you don't have that information. Never invent facts that are not present in the context.`;

  const human = `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer (cite with [[n]]):`;

  const chat = getChat();
  const res = await chat.invoke(
    [new SystemMessage(system), new HumanMessage(human)],
    { callbacks: [handler] },
  );

  const answer = res.content.toString();
  const sources: Source[] = rows.map((r) => ({
    id: r.id,
    source: r.metadata?.source ?? "unknown",
    chunk_index: r.metadata?.chunk_index ?? -1,
    similarity: r.similarity,
    content: r.content,
  }));

  return { answer, sources, traceId: handler.last_trace_id ?? undefined };
}
