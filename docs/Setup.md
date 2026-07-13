# Setup — RAG Knowledge Bot

## Prerequisites
- Node.js ≥ 18 (Next 16 butuh Node 18.18+/20+).
- Akun Supabase, Google AI Studio, Langfuse Cloud.
- `npm` (atau package manager pilihan).

## 1. Install
```bash
cd rag-knowledge-bot
npm install
# tsx sudah ada di devDependencies — tidak perlu install lagi
```

## 2. Environment (.env.local, root project)
```bash
GEMINI_API_KEY=***                    # https://aistudio.google.com/apikey (gratis)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Supabase Dashboard → Settings → API → service_role
LANGFUSE_PUBLIC_KEY=pk-...            # https://cloud.langfuse.com → project Settings → API Keys
LANGFUSE_SECRET_KEY=***
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_BASE_URL=https://cloud.langfuse.com   # yang dibaca observability.ts (fallback LANGFUSE_HOST)
```
JANGAN commit `.env.local`.

## 3. Supabase
1. Buat project di supabase.com.
2. Buka **SQL Editor**, jalanin SQL dari `docs/Database.md` (extension vector, tabel `documents`, index, fungsi `match_docs`).
3. Pilih **Run and enable RLS** saat prompt muncul.

## 4. Verify Connection
```bash
node scripts/test-db.mjs
# harap: OK — documents count = 0
```

## 5. Seed (Step 2)
```bash
cp ~/Desktop/interview_prep_master.md ./interview_prep_master.md
npx tsx scripts/seed.ts
npx tsx scripts/test-ingest.ts
```

## 6. Dev Server
```bash
npm run dev
# http://localhost:3000
```

## Troubleshooting
- `fetch failed` saat test-db → `.env.local` masih placeholder, isi value nyata Supabase.
- `relation "documents" does not exist` → SQL Step 3 belum dijalanin di project yg benar.
- Embedding insert error (casting) → ubah `embedding: vectors[i]` jadi `JSON.stringify(vectors[i])`.
- `langchain/text_splitter` import gagal → ganti `@langchain/textsplitters`.
