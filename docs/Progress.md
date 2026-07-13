# Progress Status — RAG Knowledge Bot

## Status Overview
| Step | Nama | Status | Catatan |
|------|------|--------|---------|
| 1 | Setup | ✅ DONE | Next scaffold, deps, env, pgvector SQL, DB test passed |
| 2 | Ingest | ✅ DONE | `ingestDocument`, `/api/ingest`, `seed.ts`, `test-ingest.ts`, `test-split.ts` — `tsc --noEmit` + split test PASS |
| 3 | Retrieve + Generate | ✅ DONE | `/api/query` + citation; embed→match_docs→ChatGoogle(gemini-flash-latest) |
| 4 | UI | ✅ DONE | `src/app/page.tsx` client component: ask + ingest form + citation sources |
| 5 | Monitoring | ✅ DONE | Langfuse OTel (`@langfuse/otel` + `CallbackHandler`) — trace diverifikasi mendarat, token+latency auto-capture |
| 6 | Eval set (Option B) | ✅ DONE | faithfulness + answer-relevance (live, `eval.ts`) + correctness vs golden Q&A (`data/golden-qa.ts`) — `test:golden.ts` grades all 3 in ONE combined LLM call (`evaluateAll`) to stay under free-tier quota; score→Langfuse |

## Step 1 — Done ✅
- `npx create-next-app` (Next 16, TS, src/, Tailwind v4).
- Deps: langchain, @langchain/core, @langchain/google, @langchain/google-genai, @supabase/supabase-js, @langfuse/langchain, dotenv, tsx (dev).
- `.env.local` lengkap (Supabase verified via test-db).
- SQL pgvector dijalanin (RLS enabled).
- `scripts/test-db.mjs` → `OK — documents count = 0`.

## Decisions Log
| Tanggal | Keputusan | Alasan |
|---------|-----------|--------|
| 2026-07-11 | Pilih build RAG Knowledge Bot (opsi #1) | standar, aman, nunjukin RAG + citation + faithfulness |
| 2026-07-12 | Hybrid Langchain: chat `@langchain/google` (`ChatGoogle`) + embedding `@langchain/google-genai` | `@langchain/google-genai` deprecated; `@langchain/google` v0.2.1 blm punya embeddings |
| 2026-07-12 | Langfuse package = `@langfuse/langchain` (export `CallbackHandler`, bukan `LangfuseLangchain`) | `@langchain/langfuse` tidak ada di npm; v3 rename handler |
| 2026-07-12 | RLS ENABLED (bukan disable) | secure default; service_role bypass otomatis |
| 2026-07-12 | Standalone script wajib `config({ path: ".env.local" })` | dotenv default baca `.env`, bukan `.env.local` |
| 2026-07-12 | Text splitter = `@langchain/textsplitters` (bukan `langchain/text_splitter`) | Langchain v1.x hapus `text_splitter` dari exports `langchain` — import lama FAIL di Next 16 ESM |
| 2026-07-12 | `source` + `chunk_index` disimpan di kolom `metadata` jsonb | skema `documents` deploy = `id, content, metadata jsonb, embedding`; ingest code disesuaikan (bukan kolom terpisah) |
| 2026-07-12 | Embedding = `gemini-embedding-001` (3072d); ANN index di-drop | `text-embedding-004`/`embedding-001` 404 pada embedContent; pgvector ANN cap 2000-dim → exact scan (`vector(3072)`) |
| 2026-07-12 | Chat model = `gemini-flash-latest` (alias) | `gemini-2.5-flash` "no longer available to new users" (ModelFallback); alias selalu pointing ke Flash stabil terbaru |
| 2026-07-12 | Citation = chunk ASLI hasil retrieve (faithful), inline `[[n]]` | sumber nyata, bukan hasil parse JSON LLM → hindari hallucinated citation |
| 2026-07-12 | `match_docs` RPC: param `q` dikirim sbg vector literal string `[...]` | PostgREST ga cast array JSON → `vector`; string literal yg benar |
| 2026-07-12 | `scripts/test-query.ts` (integration test) | assert answer non-empty + sources well-formed; jalan end-to-end (embed→rpc→chat) |
| 2026-07-12 | `Source.content` disertakan di response query | UI bisa tampilin snippet citation (faithful preview), ga perlu fetch ulang |
| 2026-07-12 | UI = client component (`"use client"`) + ingest box | Next 16 valid; demo self-contained (paste doc → ask) |
| 2026-07-13 | Langfuse v5 = OTel-based; global `NodeTracerProvider` + `LangfuseSpanProcessor` (`observability.ts`) | `CallbackHandler` hanya buat span, butuh tracer provider biar diekspor; `@opentelemetry/sdk-trace-node` must `^2` (dedupe sdk-trace-base) |
| 2026-07-13 | Faithfulness via LLM-judge Gemini temp 0 (`eval.ts`) + score→Langfuse `POST /api/public/scores` | `CallbackHandler` tidak punya method `score()`; score dikirim best-effort (fail silent) |
| 2026-07-13 | Option B: answer-relevance LLM-judge (`evaluateAnswerRelevance`) di request path + score `answer_relevance` ke Langfuse; correctness judge (`evaluateCorrectness`) golden-only | sejajar faithfulness → monitoring JD (answer_relevance per query); correctness butuh expected answer → tidak di request path |

## Open Items / Risks
- Next.js 16 bleeding edge — verifikasi konvensi route/UI sebelum Step 2–4.
- `@langchain/google` v0.2.1 masih 0.x — API chat bisa berubah.
- Embedding 3072-d (`gemini-embedding-001`) harus konsisten dgn `vector(3072)`; ANN index di-drop (pgvector cap 2000-dim) → exact cosine scan.
- Step 6 + Option B ✅: faithfulness + answer-relevance di request path (`query.ts`); golden Q&A set + correctness eval di `test-golden.ts` (offline/CI).

## Next Action
Step 1–6 + Option B DIIMPLEMENTASIKAN (tsc clean). Golden eval pipeline terverifikasi (test:eval 100% + item-1 golden 100/100/100); full 10-item run pending free-tier quota recovery — re-run `npm run test:golden` saat kuota pulih. Belum commit (menunggu run hijau) & belum push. Sisa: commit Option B lokal → (a) push ke GitHub (repo: github.com/muhammalif/rag-knowledge-bot); (b) README demo + catatan interview; (c) deploy Vercel + Supabase.
