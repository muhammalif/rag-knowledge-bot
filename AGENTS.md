<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — RAG Knowledge Bot

## What this project is
A mini **AI-wrapper / RAG Knowledge Bot** built as a portfolio piece for an **AI Engineer (Applied AI)** job interview. The bot ingests documents, answers questions using Retrieval-Augmented Generation with source citations, and traces every call through an observability stack.

This is a learning + demonstration project. The goal is to showcase: RAG, context engineering, citation/faithfulness, and AI monitoring/observability — the exact gaps called out in the target JD.

## Stack (exact versions — see package.json)
| Layer | Package | Notes |
|-------|---------|-------|
| Framework | `next@16.2.10` (App Router, TS, `src/`, Tailwind v4) | ⚠️ bleeding edge — verify conventions in `node_modules/next/dist/docs/` before writing routes/UI |
| UI | `react@19.2.4`, `react-dom@19.2.4` | |
| Text splitter | `@langchain/textsplitters@^1.0.1` | `RecursiveCharacterTextSplitter` — Langchain v1.x moved it OUT of `langchain` (⚠️ `langchain/text_splitter` no longer exists in exports) |
| Orchestration | `langchain@^1.5.3` | core orchestration (chains/runnables); `Document` from `@langchain/core` |
| Core | `@langchain/core@^1.2.2` | |
| LLM (chat) | `@langchain/google@^0.2.1` → `ChatGoogle` | Gemini Flash. NON-deprecated package |
| Embedding | `@langchain/google-genai@^2.2.0` → `GoogleGenerativeAIEmbeddings` | `gemini-embedding-001`, 3072-dim (note: `text-embedding-004` 404s on embedContent) |
| Vector DB | `@supabase/supabase-js@^2.110.2` + pgvector | |
| Monitoring | `@langfuse/langchain@^5.9.1` → `CallbackHandler` | NOT `LangfuseLangchain` (renamed in v3) |
| Env loading (scripts) | `dotenv@^17.4.2` | |

## Project layout
```
src/
  app/
    api/
      ingest/route.ts     # POST — ingest a document (Step 2)
      query/route.ts      # POST — answer a question (Step 3, planned)
    page.tsx              # chat UI (Step 4, planned)
  lib/
    supabase.ts           # Supabase client singleton
    ingest.ts             # ingestDocument(text, source)
scripts/
  test-db.mjs             # verify Supabase connection (Step 1 ✅)
  seed.ts                 # seed interview_prep_master.md (Step 2)
  test-ingest.ts          # verify ingest result (Step 2)
docs/                    # PRD, Architecture, Database, Progress, Setup, API
```

## Conventions
- App code lives in `src/app`. API route handlers: `src/app/api/<name>/route.ts` exporting `POST`/`GET`.
- Shared logic in `src/lib`. Import via `@/*` alias (→ `src/*`).
- Standalone Node/TS scripts live in `scripts/` and run with `npx tsx scripts/<file>.ts`.
- `.env.local` holds all secrets. Next auto-loads it at runtime. **Standalone scripts MUST call `config({ path: ".env.local" })`** (dotenv does not read `.env.local` by default).
- Embedding dimension is **3072** (`gemini-embedding-001`) — must match `vector(3072)` in the DB. (pgvector ANN indexes cap at 2000 dims, so retrieval uses exact cosine scan, no ivfflat/hnsw.)

## Environment variables (.env.local)
```
GEMINI_API_KEY=***
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=***
LANGFUSE_HOST=https://cloud.langfuse.com
```

## Common commands
```bash
npm run dev                       # Next dev server (http://localhost:3000)
node scripts/test-db.mjs          # verify Supabase connection
npx tsx scripts/seed.ts [path]    # ingest a markdown file
npx tsx scripts/test-ingest.ts    # assert ingest produced non-null 3072-d embeddings
```

## ⚠️ Next.js 16 caution
Next 16 may change route-handler, caching, and `params` conventions vs Next 13–15. Before implementing Steps 2–4 (API routes + UI), read the relevant guide under `node_modules/next/dist/docs/`. The route-handler pattern (`export async function POST(req: NextRequest)`) is still valid, but verify dynamic/caching behavior.

## Build plan (TDD, 6 steps)
See `docs/Progress.md` and `docs/Architecture.md`.
- **Step 1 — Setup**: ✅ done (Next scaffold, deps, env, pgvector SQL, DB test).
- **Step 2 — Ingest**: `ingestDocument` + `POST /api/ingest` + seed script.
- **Step 3 — Retrieve + Generate**: `POST /api/query` with citation JSON.
- **Step 4 — UI**: chat page rendering answer + sources.
- **Step 5 — Monitoring**: wrap calls with Langfuse `CallbackHandler`.
- **Step 6 — Eval set**: golden Q&A, faithfulness + answer-relevance scoring.
