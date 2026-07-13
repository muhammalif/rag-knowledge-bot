# RAG Knowledge Bot

Mini RAG (Retrieval-Augmented Generation) chatbot — tanya jawab di atas dokumen yang di-index, jawaban **grounded** di chunk yang di-retrieve lengkap dengan citation inline `[[n]]`, observabilitas Langfuse, dan faithfulness eval.

Dibangun sebagai portofolio Applied AI Engineer: nunjukin RAG + context engineering + monitoring pasca-deployment + eval — bukan cuma "panggil LLM".

## Features
- **RAG end-to-end**: ingest dokumen → chunk → embed → simpan di pgvector → retrieve → generate jawaban.
- **Inline citations**: jawaban pakai `[[n]]` yang link ke chunk asli (faithful, bukan parse JSON LLM).
- **Observabilitas (Langfuse)**: tiap generate call di-trace otomatis — model, token cost, latency P95.
- **Faithfulness eval**: tiap jawaban di-graded LLM-as-judge (Gemini, temp 0) vs chunk retrieved; skor di-POST ke Langfuse.
- **UI + API**: Next.js UI (ingest + ask) dan REST endpoint `/api/query`, `/api/ingest`.

## Stack
| Layer | Tech |
|-------|------|
| App / Frontend | Next.js (App Router) + TypeScript + React |
| AI / Orchestration | Langchain (`@langchain/google-genai`) + Gemini (`gemini-flash-latest`, `gemini-embedding-001` 3072-d) |
| Vector store | pgvector di Supabase (Postgres) |
| Observability | Langfuse via OpenTelemetry (`@langfuse/langchain` + `@langfuse/otel`) |
| Eval | Gemini LLM-as-judge (faithfulness) |

## Quick Start

### Prasyarat
- Node.js ≥ 18, `npm`.
- Akun Supabase, Google AI Studio (Gemini), Langfuse Cloud (opsional untuk observability).

### 1. Install
```bash
cd rag-knowledge-bot
npm install
```

### 2. Environment
Buat `.env.local` di root:
```
GEMINI_API_KEY=***                         # https://aistudio.google.com/apikey (gratis)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # Supabase Dashboard → Settings → API → service_role
LANGFUSE_PUBLIC_KEY=pk-...                 # opsional
LANGFUSE_SECRET_KEY=sk-.......com   # yang dibaca observability.ts (fallback LANGFUSE_HOST)
```
JANGAN commit `.env.local`. `LANGFUSE_*` opsional — tanpa itu, tracing di-skip & app tetap jalan.

### 3. Supabase
Buka **SQL Editor** di project Supabase, jalanin SQL dari [`docs/Database.md`](docs/Database.md) (extension `vector`, tabel `documents`, index, fungsi `match_docs`). Pilih **Run and enable RLS**.

### 4. Seed knowledge base
```bash
cp ~/Desktop/interview_prep_master.md ./interview_prep_master.md   # atau dokumen lo
npx tsx scripts/seed.ts
node scripts/test-db.mjs
```
Ganti path/source di `scripts/seed.ts` untuk dokumen sendiri.

### 5. Jalankan
```bash
npm run dev      # http://localhost:3000
```
Buka UI → tab **Ask** → tanya. Atau lihat [`docs/Workflow.md`](docs/Workflow.md) untuk alur lengkap.

## Usage

**UI**
- Tab *Add a document*: isi source name + paste teks → **Ingest**.
- Tab *Ask a question*: ketik pertanyaan → **Ask** → jawaban + citation `[[n]]` + link trace Langfuse + badge faithfulness.

**API**
```bash
curl -X POST localhost:3000/api/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"Apa itu context engineering?"}'
```
Response: `answer`, `sources[]`, `traceId`, `faithfulness{score,faithful,unsupportedClaims,reasoning}`.
Lihat kontrak lengkap di [`docs/API.md`](docs/API.md).

## Scripts
| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (localhost:3000). |
| `npm run build` / `npm run start` | Production build / serve. |
| `npm run test:split` | Verifikasi chunking (size/overlap). |
| `npm run test:ingest` | Verifikasi baris masuk pgvector (embedding 3072-d). |
| `npm run test:query` | Query RAG nyata (butuh Gemini + Supabase). |
| `npm run test:monitor` | Verifikasi trace sampai Langfuse. |
| `npm run test:eval` | Grade faithfulness + verifikasi skor masuk Langfuse. |

## Project Structure
```
src/
  lib/
    ingest.ts          # split + embed + insert
    query.ts           # retrieve + generate + faithfulness + score
    observability.ts   # OTel provider + Langfuse span processor + scoreTrace
    eval.ts            # faithfulness LLM-as-judge
    supabase.ts        # service_role client
  app/
    api/query/route.ts # POST /api/query
    api/ingest/route.ts# POST /api/ingest
    page.tsx           # UI
scripts/               # seed + battery tests
docs/                  # Architecture, API, Database, PRD, Progress, Setup, Workflow
```

## Documentation
Semua detail di [`docs/`](docs/):
- [`docs/Architecture.md`](docs/Architecture.md) — arsitektur & alur data.
- [`docs/API.md`](docs/API.md) — kontrak endpoint.
- [`docs/Database.md`](docs/Database.md) — skema pgvector + SQL.
- [`docs/PRD.md`](docs/PRD.md) — product requirements & pemetaan ke JD.
- [`docs/Progress.md`](docs/Progress.md) — status step & decisions log.
- [`docs/Setup.md`](docs/Setup.md) — setup lengkap.
- [`docs/Workflow.md`](docs/Workflow.md) — cara pakai praktis.

## Deploy
Vercel (frontend) + Supabase cloud (DB). Set env yang sama di Vercel project settings.
