# Progress Status — RAG Knowledge Bot

## Status Overview
| Step | Nama | Status | Catatan |
|------|------|--------|---------|
| 1 | Setup | ✅ DONE | Next scaffold, deps, env, pgvector SQL, DB test passed |
| 2 | Ingest | ✅ DONE | `ingestDocument`, `/api/ingest`, `seed.ts`, `test-ingest.ts`, `test-split.ts` — `tsc --noEmit` + split test PASS |
| 3 | Retrieve + Generate | ✅ DONE | `/api/query` + citation; embed→match_docs→ChatGoogle(gemini-flash-latest) |
| 4 | UI | ✅ DONE | `src/app/page.tsx` client component: ask + ingest form + citation sources |
| 5 | Monitoring | ⏳ PENDING | Langfuse `CallbackHandler` |
| 6 | Eval set | ⏳ PENDING | golden Q&A + skor |

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

## Open Items / Risks
- Next.js 16 bleeding edge — verifikasi konvensi route/UI sebelum Step 2–4.
- `@langchain/google` v0.2.1 masih 0.x — API chat bisa berubah.
- Embedding 3072-d (`gemini-embedding-001`) harus konsisten dgn `vector(3072)`; ANN index di-drop (pgvector cap 2000-dim) → exact cosine scan.
- Step 6 eval set butuh definisi golden Q&A dari `interview_prep_master.md`.

## Next Action
Implementasi **Step 5 — Monitoring**: tempel `CallbackHandler` Langfuse di embed + generate (`src/lib/query.ts`, `src/lib/ingest.ts`). Lalu Step 6 (eval set).
