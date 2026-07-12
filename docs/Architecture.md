# Architecture — RAG Knowledge Bot

## 1. Overview
Single Next.js (App Router) application. API route handlers orchestrate the RAG pipeline via Langchain; Supabase (Postgres + pgvector) is the vector store; Langfuse traces every LLM/embedding call.

## 2. Data Flow

### Ingest
```
[Doc text] → RecursiveCharacterTextSplitter(1000/200)
           → GoogleGenerativeAIEmbeddings (gemini-embedding-001, 3072d)
           → Supabase `documents` table  (content, metadata{source,chunk_index}, embedding)
```

### Query
```
[Question] → embed (gemini-embedding-001)
           → match_docs(k=4)  [pgvector cosine `<=>`]
           → top-k chunks → ChatGoogle prompt (context + instruksi cite [[n]])
           → answer pakai inline [[n]]; sources = chunk ASLI (faithful, bukan parsed JSON) → UI render
           ↘ CallbackHandler (Langfuse) wraps embed + generate
```

## 3. Components
| Component | Path | Responsibility |
|-----------|------|----------------|
| Supabase client | `src/lib/supabase.ts` | singleton `@supabase/supabase-js` (service_role) |
| Ingest logic | `src/lib/ingest.ts` | `ingestDocument(text, source)` — split, embed, insert |
| Ingest API | `src/app/api/ingest/route.ts` | `POST {text, source}` → ingest |
| Query API | `src/app/api/query/route.ts` | `POST {question}` → retrieve + generate |
| Chat UI | `src/app/page.tsx` | input + answer + sources (client component, + ingest box) |
| Seed script | `scripts/seed.ts` | ingest `interview_prep_master.md` via tsx |
| DB test | `scripts/test-db.mjs` | verify Supabase connection |

## 4. Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 16 App Router | fullstack JS/TS, sudah dikuasai coy |
| Chat LLM | `@langchain/google` `ChatGoogle` (`gemini-flash-latest`) | NON-deprecated package, free tier; alias → Flash stabil terbaru |
| Embedding | `@langchain/google-genai` `GoogleGenerativeAIEmbeddings` | `gemini-embedding-001` 3072d (`text-embedding-004` 404s on embedContent for this key) |
| Splitter | `langchain` `RecursiveCharacterTextSplitter` | standard, chunkSize 1000 / overlap 200 |
| Vector store | Supabase pgvector | Postgres sudah dikuasai coy |
| Similarity | cosine `<=>` exact scan (no ANN index) | pgvector ANN caps at 2000 dims; gemini-embedding-001 is 3072 — exact scan fine for demo scale |
| Monitoring | `@langfuse/langchain` `CallbackHandler` | Langfuse v3 JS integration |
| Deploy | Vercel + Supabase cloud | live link untuk interviewer |

## 5. Request / Response Contracts (planned)
**POST /api/ingest**
```json
{ "text": "...", "source": "interview_prep_master.md" }
→ { "source": "interview_prep_master.md", "chunks": 42, "inserted": 42 }
```

**POST /api/query**
```json
{ "question": "Apa bedanya context engineering dan prompt engineering?" }
→ {
  "answer": "...",
  "sources": [
    { "id": "uuid", "source": "interview_prep_master.md", "chunk_index": 3, "similarity": 0.91, "content": "..." }
  ]
}
```

## 6. Monitoring
- `CallbackHandler` dari `@langfuse/langchain` di-pass ke LLM/embeddings `callbacks`.
- Auto-read `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` dari env.
- Dashboard menampilkan: token cost, latency P95, trace per query.

## 7. Next.js 16 Notes
Next 16 may alter route-handler / caching / `params` conventions. Verify against `node_modules/next/dist/docs/` before implementing Steps 2–4. The `export async function POST(req: NextRequest)` pattern remains valid.
