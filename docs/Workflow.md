# Workflow — RAG Knowledge Bot

Panduan praktis pakai project ini: dari clone sampai query + lihat trace/eval. Fokus **cara pakai**, bukan arsitektur (untuk itu baca `docs/Architecture.md`).

## 0. Prasyarat
- Node.js ≥ 18 + `npm`.
- Akun Supabase, Google AI Studio (Gemini), Langfuse Cloud (opsional, untuk observability).
- File dokumen sumber (`.txt` / `.md`) yang mau dijadikan knowledge base.

## 1. First-run setup (sekali)
```bash
cd rag-knowledge-bot
npm install
```
Buat `.env.local` di root (lihat `docs/Setup.md` untuk cara dapat tiap key):
```
GEMINI_API_KEY=...                         # https://aistudio.google.com/apikey (gratis)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # Supabase Dashboard → Settings → API → service_role
LANGFUSE_PUBLIC_KEY=pk-...                 # opsional
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com   # dibaca observability.ts (fallback LANGFUSE_HOST)
```
JANGAN commit `.env.local`.

Supabase: buka **SQL Editor**, jalanin SQL dari `docs/Database.md` (extension `vector`, tabel `documents`, index, fungsi `match_docs`). Pilih **Run and enable RLS** saat prompt.

## 2. Seed knowledge base (Step 2 — ingest)
Letakkan file dokumen di root project, lalu jalanin seeder:
```bash
npx tsx scripts/seed.ts          # baca file → chunk (1000/200) → embed (3072d) → insert pgvector
node scripts/test-db.mjs         # cek jumlah dokumen (harus > 0)
npx tsx scripts/test-ingest.ts   # verifikasi embedding 3072-d masuk ke kolom `embedding`
```
Untuk ganti dokumen sendiri: edit path + `source` di `scripts/seed.ts`, lalu jalanin ulang seed + `test-ingest`.

## 3. Jalanin app
```bash
npm run dev        # http://localhost:3000
```
- Tab **Ingest**: paste teks → simpan ke vector store.
- Tab **Ask**: tanya → dapat jawaban + citation `[[n]]` ke chunk asli + link trace Langfuse + badge faithfulness.

Lewat API (tanpa UI):
```bash
curl -X POST localhost:3000/api/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"Apa itu context engineering?"}'
```

## 4. Verifikasi (tanpa cek UI manual)
| Perintah | Cek apa |
|----------|---------|
| `npm run test:split` | chunking size/overlap wajar |
| `npm run test:ingest` | baris masuk pgvector, embedding 3072-d |
| `npm run test:query` | jawaban grounded + source nyata |
| `npm run test:monitor` | trace sampai Langfuse (token + latency auto-capture) |
| `npm run test:eval` | faithfulness di-graded + score masuk Langfuse |
| `npm run build` | production build lolos (`tsc --noEmit` juga clean) |

## 5. Observability (Langfuse — Step 5)
- Tiap generate call di-trace otomatis via global OTel `TracerProvider` + `@langfuse/langchain` `CallbackHandler`.
- Buka dashboard Langfuse → lihat model, token, latency per query.
- Response `POST /api/query` mengembalikan `traceId` → klik untuk lihat trace persisnya.

## 6. Eval (faithfulness — Step 6)
- Tiap query di-graded LLM-judge (Gemini, `temperature=0`): jawaban vs chunk yang di-retrieve.
- Field `faithfulness` di response: `score` (0–1), `faithful` (bool), `unsupportedClaims` (array), `reasoning`. Tampil sebagai badge di UI.
- Score juga di-POST ke Langfuse (`/api/public/scores`) → bisa filter trace dengan faithfulness rendah.
- `npm run test:eval` jalanin end-to-end + verifikasi score nyampe di Langfuse.

## 7. Task umum
- **Ganti dokumen**: edit `scripts/seed.ts`, jalanin ulang `seed.ts` + `test-ingest.ts`.
- **Cek faithfulness query tertentu**: panggil `/api/query`, baca field `faithfulness`.
- **Matiin observability**: kosongkan `LANGFUSE_*` di `.env.local` → tracing di-skip, app tetap jalan.
- **Deploy**: Vercel (frontend) + Supabase cloud (DB). Set env yang sama di Vercel project settings.

## 8. Layout penting
- `src/lib/ingest.ts` — split + embed + insert
- `src/lib/query.ts` — retrieve + generate + faithfulness + score
- `src/lib/observability.ts` — OTel provider + Langfuse span processor + `scoreTrace`
- `src/lib/eval.ts` — faithfulness LLM-as-judge
- `src/app/api/query/route.ts`, `src/app/api/ingest/route.ts` — endpoint
- `src/app/page.tsx` — UI (ingest + ask + badge faithfulness + link trace)
- `scripts/` — seed + battery tests (`test-db`, `test-split`, `test-ingest`, `test-query`, `test-monitor`, `test-eval`)
- `docs/` — Architecture, API, Database, PRD, Progress, Setup, **Workflow** (file ini)

## 9. Alur end-to-end (mental model)
```
dokumen ──(seed/ingest)──▶ pgvector (documents)
                                    │
pertanyaan ──▶ embed ──▶ similarity search ──▶ context chunks
                                                    │
                                            ──▶ Gemini generate ──▶ jawaban + [[n]] citation
                                                    │                │
                                            faithfulness eval   Langfuse trace + score
```
