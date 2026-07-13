import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { CallbackHandler } from "@langfuse/langchain";

// Langfuse v5 is OpenTelemetry-based. The `@langfuse/langchain` CallbackHandler
// only *creates* spans — they are only exported if a global TracerProvider with a
// LangfuseSpanProcessor is registered. We do that once (singleton) here.
//
// Credentials are read from env (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY /
// LANGFUSE_BASE_URL). Next.js auto-loads .env.local server-side; tsx scripts load
// it via dotenv in scripts/*.ts.
let initialized = false;

export function initLangfuse(): void {
  if (initialized) return;
  initialized = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST;

  if (!publicKey || !secretKey) {
    console.warn(
      "[observability] LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY missing — Langfuse tracing disabled.",
    );
    return;
  }

  // OTel JS 2.x: pass span processors via the constructor (no addSpanProcessor()).
  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl: baseUrl || "https://cloud.langfuse.com",
      }),
    ],
  });
  provider.register();
}

/**
 * Best-effort: attach a numeric score to a Langfuse trace (e.g. faithfulness).
 * Fails silently — never blocks the request path.
 */
export async function scoreTrace(
  traceId: string,
  name: string,
  value: number,
  comment?: string,
): Promise<void> {
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl =
    process.env.LANGFUSE_BASE_URL ||
    process.env.LANGFUSE_HOST ||
    "https://cloud.langfuse.com";
  if (!pk || !sk) return;
  const auth = Buffer.from(`${pk}:${sk}`).toString("base64");
  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/api/public/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ traceId, name, value, comment }),
    });
    if (!resp.ok) {
      console.warn(`[observability] Langfuse score ${name} failed: ${resp.status}`);
    }
  } catch (e) {
    console.warn(`[observability] Langfuse score ${name} error: ${(e as Error).message}`);
  }
}

/**
 * Build a Langfuse CallbackHandler for a single RAG operation.
 * Attach it to the Langchain LLM `.invoke` call via `{ callbacks: [handler] }`.
 * Read `handler.last_trace_id` after the run to deep-link the trace in the UI.
 */
export function getHandler(opts: {
  sessionId?: string;
  tags?: string[];
} = {}): CallbackHandler {
  initLangfuse();
  return new CallbackHandler({
    sessionId: opts.sessionId,
    tags: ["rag-knowledge-bot", ...(opts.tags ?? [])],
    version: "1.0.0",
  });
}
