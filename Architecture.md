# Architecture — RAG Knowledge Bot

Next.js (App Router) + TypeScript. Retrieval-Augmented Generation over pgvector (Supabase). Gemini for embeddings + generation. Langfuse for observability.

## Data flow

```
User pastes doc
  → POST /api/ingest
  → chunk (RecursiveCharacterTextSplitter, 1000 / 200 overlap)
  → Gemini embed (text-embedding-004)
  → pgvector table `documents` (embedding vector + metadata: source, chunk_index, content)

User asks
  → POST /api/query
  → Gemini embed question
  → pgvector cosine similarity search (top-k)
  → assemble context + system prompt ("cite with [[n]]")
  → Gemini generate (gemini-2.0-flash)
  → answer with inline [[n]] citations + retrieved sources
```

## Modules (`src/lib`)

| File | Responsibility |
|------|----------------|
| `supabase.ts` | Server client (`SUPABASE_URL`, `SUPABASE_KEY`). |
| `embeddings.ts` | `GoogleGenerativeAIEmbeddings` (text-embedding-004). |
| `llm.ts` | `ChatGoogle` (gemini-2.0-flash). |
| `ingest.ts` | chunk → embed → upsert. |
| `query.ts` | embed question → similarity search → generate → citation parsing. Returns `traceId`. |
| `observability.ts` | Langfuse OTel wiring (singleton `TracerProvider` + `LangfuseSpanProcessor`) + `getHandler()`. |

## Observability (Step 5)

Langfuse v5 is OpenTelemetry-based. `@langfuse/langchain`'s `CallbackHandler` **only creates spans** — they are exported only if a global `TracerProvider` with a `LangfuseSpanProcessor` is registered. `observability.ts` does that once (singleton):

1. Registers `NodeTracerProvider({ spanProcessors: [LangfuseSpanProcessor] })` globally.
2. `getHandler({ sessionId, tags })` returns a `CallbackHandler` attached to the LLM `.invoke` call in `query.ts` via `{ callbacks: [handler] }`.
3. Credentials from env: `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL`.
4. The generation trace (model, token usage, latency P95) is auto-captured. `query()` returns `traceId` (= the Langfuse trace id, which equals the OTel `span.traceId`) so the UI deep-links to `https://cloud.langfuse.com/trace/<traceId>`.

### Gotchas (so you don't repeat them)

- `@langfuse/langchain@5` is **OTel-only** — there is no `init()` helper. You MUST register a `TracerProvider` yourself, or traces never leave the process.
- The SDK env var is **`LANGFUSE_BASE_URL`** (not `LANGFUSE_HOST`).
- Align `@opentelemetry/sdk-trace-node` to **`^2`** so it shares the same `@opentelemetry/sdk-trace-base@2.x` as `@langfuse/otel`. A version skew crashes span export with `TypeError: Cannot read properties of undefined (reading 'name')`.
- OTel JS 2.x takes `spanProcessors` via the **constructor** (no `addSpanProcessor()` method).
- Langfuse ingestion has a few seconds of lag — the monitor test polls the API.
- `Embeddings.embedQuery/embedDocuments` take **no options arg**, so callbacks can't attach to embeddings the Langchain way; we trace the generation (the cost/latency-critical path) only.

## Stack

| Layer | Tech |
|-------|------|
| App | Next.js 16 (App Router), React 19, TypeScript |
| AI | Langchain (`@langchain/core`, `@langchain/google`, `@langchain/google-genai`), Gemini |
| Embeddings | `text-embedding-004` |
| LLM | `gemini-2.0-flash` |
| Vector store | pgvector on Supabase (Postgres) |
| Observability | Langfuse (`@langfuse/langchain` + `@langfuse/otel` + OpenTelemetry) |
