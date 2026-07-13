# Architecture — RAG Knowledge Bot

## 1. Overview
Single Next.js (App Router) application. API route handlers orchestrate the RAG pipeline via Langchain; Supabase (Postgres + pgvector) is the vector store; Langfuse (OpenTelemetry-based) traces every generation call; a Gemini LLM-judge scores answer **faithfulness** and **answer-relevance** (live, per request) and **correctness** vs a golden Q&A set (regression eval), pushing all three scores back to Langfuse.

## 2. Data Flow

### Ingest
```
[Doc text] → RecursiveCharacterTextSplitter(1000/200)
           → GoogleGenerativeAIEmbeddings (gemini-embedding-001, 3072d)
           → Supabase `documents` table  (content, metadata{source,chunk_index}, embedding vector(3072))
```

### Query
```
[Question] → embed (gemini-embedding-001, 3072d)
           → match_docs(k=4)  [pgvector cosine <=>]
           → top-k chunks → ChatGoogle(gemini-flash-latest) prompt (context + instruksi cite [[n]])
           → answer pakai inline [[n]]; sources = chunk ASLI (faithful)
           ↘ CallbackHandler (Langfuse OTel) wraps the generate call
           → evaluateFaithfulness(answer, contexts) [LLM-judge, temp 0]
           → evaluateAnswerRelevance(question, answer) [LLM-judge, temp 0]
           → scoreTrace(traceId, "faithfulness", …) + scoreTrace(traceId, "answer_relevance", …) → Langfuse
           (skipped when query(..., {skipEval:true}) — golden eval grades all 3 in one combined call)
```

## 3. Components
| Component | Path | Responsibility |
|-----------|------|----------------|
| Supabase client | `src/lib/supabase.ts` | singleton `@supabase/supabase-js` (service_role, lazy init) |
| Ingest logic | `src/lib/ingest.ts` | `ingestDocument(text, source)` — split, embed, insert |
| Query logic | `src/lib/query.ts` | `query(question, opts?)` — embed → retrieve → generate → (faithfulness + answer_relevance unless `skipEval`); returns `{answer, sources, traceId, faithfulness?, answerRelevance?}` |
| Observability | `src/lib/observability.ts` | OTel singleton (`NodeTracerProvider` + `LangfuseSpanProcessor`), `getHandler()`, `scoreTrace()` |
| Eval (faith/relevance/correctness) | `src/lib/eval.ts` | `evaluateFaithfulness`, `evaluateAnswerRelevance`, `evaluateCorrectness`, `evaluateAll` (combined 3-in-1) — Gemini LLM-judges (temp 0) |
| Ingest API | `src/app/api/ingest/route.ts` | `POST {text, source?}` → ingest |
| Query API | `src/app/api/query/route.ts` | `POST {question, k?, skipEval?}` → retrieve + generate + faithfulness + answer_relevance |
| Chat UI | `src/app/page.tsx` | answer + sources + faithfulness badge + Langfuse trace link (client component, + ingest box) |
| Seed script | `scripts/seed.ts` | ingest `interview_prep_master.md` via tsx |
| Tests | `scripts/test-*.ts`, `scripts/test-db.mjs` | db / split / ingest / query / monitor / eval |

## 4. Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 16 App Router | fullstack JS/TS, sudah dikuasai coy |
| Chat LLM | `@langchain/google` `ChatGoogle` (`gemini-flash-latest`) | NON-deprecated package, free tier; alias → Flash stabil terbaru |
| Embedding | `@langchain/google-genai` `GoogleGenerativeAIEmbeddings` (`gemini-embedding-001`, 3072d) | `text-embedding-004` 404s on embedContent for this key |
| Splitter | `@langchain/textsplitters` `RecursiveCharacterTextSplitter` | Langchain v1.x removed `text_splitter` from `langchain` exports |
| Vector store | Supabase pgvector | Postgres sudah dikuasai coy |
| Similarity | cosine `<=>` exact scan (no ANN index) | pgvector ANN caps at 2000 dims; gemini-embedding-001 is 3072 → exact scan fine for demo scale |
| Monitoring | `@langfuse/langchain` v5 `CallbackHandler` + `@langfuse/otel` (`LangfuseSpanProcessor`) | Langfuse v5 is OTel-based; handler only creates spans, needs a registered TracerProvider |
| Faithfulness | Gemini LLM-judge (temp 0) in `eval.ts` | cheap, grounded grading; score pushed to Langfuse |
| Deploy | Vercel + Supabase cloud | live link untuk interviewer |

## 5. Request / Response Contracts (implemented — Steps 2–3, extended Steps 5–6)
**POST /api/ingest**  (201)
```json
{ "text": "...", "source": "interview_prep_master.md" }
→ { "source": "interview_prep_master.md", "chunks": 42, "inserted": 42 }
```

**POST /api/query**  (200)
```json
{
  "answer": "...",
  "sources": [
    { "id": "uuid", "source": "interview_prep_master.md", "chunk_index": 3, "similarity": 0.91, "content": "..." }
  ],
  "traceId": "9f03991a...",
  "faithfulness": { "score": 1, "faithful": true, "unsupportedClaims": [], "reasoning": "..." }
}
```
- `traceId` present bila Langfuse configured; `faithfulness` selalu dihitung (LLM-judge).

## 6. Monitoring (Step 5)
Langfuse v5 is OpenTelemetry-based.
- `observability.ts` registers a global `NodeTracerProvider({ spanProcessors: [LangfuseSpanProcessor] })` once (singleton) → spans are exported.
- `getHandler({ sessionId, tags })` returns a `CallbackHandler` attached to the LLM `.invoke` call in `query.ts` via `{ callbacks: [handler] }`.
- Credentials: `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` (falls back to `LANGFUSE_HOST`).
- Generation trace (model, token usage, latency) auto-captured. `query()` returns `traceId` (= OTel `span.traceId`) → UI deep-links `https://cloud.langfuse.com/trace/<traceId>`.
- Embeddings are **not** traced (`Embeddings.embedQuery` takes no options arg) — we trace the generation path only.

### Gotchas (so you don't repeat them)
- `@langfuse/langchain@5` is **OTel-only** — no `init()` helper; you MUST register a `TracerProvider` or traces never leave the process.
- SDK env var is **`LANGFUSE_BASE_URL`** (not `LANGFUSE_HOST`).
- Align `@opentelemetry/sdk-trace-node` to **`^2`** so it shares `@opentelemetry/sdk-trace-base@2.x` with `@langfuse/otel`; a version skew crashes export with `TypeError: Cannot read properties of undefined (reading 'name')`.
- OTel JS 2.x takes `spanProcessors` via the **constructor** (no `addSpanProcessor()`).
- Langfuse ingestion has a few seconds of lag — the monitor test polls the API.

## 7. Evaluation (Step 6)
- `src/lib/eval.ts` → `evaluateFaithfulness(answer, contexts)`: Gemini judge (temp 0) grades whether the answer is fully supported by retrieved context; returns `{score 0..1, faithful, unsupportedClaims[], reasoning}`.
- In `query.ts`, after generation, faithfulness is computed and `scoreTrace(traceId, "faithfulness", score, reasoning)` POSTs the score to Langfuse `/api/public/scores` (best-effort, fail-silent — `CallbackHandler` has no `score()` method).
- UI renders a faithfulness badge (%) + any unsupported claims.
- `scripts/test-eval.ts` runs an end-to-end query, grades it, and verifies the score lands in Langfuse.
- **Answer-relevance** (`evaluateAnswerRelevance`): independent of faithfulness — does the answer actually address the question? Computed in the live request path (unless `skipEval`) and scored as `answer_relevance` in Langfuse.
- **Correctness vs golden** (`evaluateCorrectness`): needs an expected answer, so it lives only in `scripts/test-golden.ts` (golden-set regression), not the request path.
- `scripts/test-golden.ts` runs every Q&A in `data/golden-qa.ts` through the real pipeline with `skipEval:true`, then grades **faithfulness + answer_relevance + correctness in a single combined LLM call** (`evaluateAll`) to keep the free-tier call budget low (3 calls/item instead of 5). Reports per-item + average scores and verifies all three land in Langfuse.

## 8. Next.js 16 Notes
Next 16 may alter route-handler / caching / `params` conventions. Verify against `node_modules/next/dist/docs/` before implementing routes/UI. The `export async function POST(req: NextRequest)` pattern remains valid; both routes set `runtime = "nodejs"` + `dynamic = "force-dynamic"`.
