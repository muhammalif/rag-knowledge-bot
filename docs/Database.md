# Database — Supabase + pgvector

## 1. Engine
Supabase Postgres dengan ekstensi **pgvector**. Vector store untuk RAG retrieval.

## 2. Schema (SQL Editor)
```sql
create extension if not exists vector;

create table documents (
  id uuid primary key default gen_random_uuid(),
  content text,
  metadata jsonb,
  embedding vector(3072)
);

-- NOTE: no ANN index (ivfflat/hnsw) — pgvector in this Supabase build caps
-- ANN indexes at 2000 dimensions, and gemini-embedding-001 outputs 3072.
-- Retrieval uses exact cosine scan via match_docs (fine for demo scale).
-- To add an ANN index later, switch to a <=2000-dim embedding model.

create or replace function match_docs(q vector(3072), k int)
returns table(id uuid, content text, metadata jsonb, similarity float)
language sql as $$
  select id, content, metadata, 1 - (embedding <=> q) as similarity
  from documents
  order by embedding <=> q
  limit k;
$$;
```

## 3. Kolom
| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| `id` | uuid | PK auto-gen |
| `content` | text | teks chunk |
| `metadata` | jsonb | `{ "source": string, "chunk_index": int }` |
| `embedding` | vector(3072) | hasil `gemini-embedding-001` (3072-d) |

## 4. Embedding Dimension
- Model: Gemini `gemini-embedding-001` → **3072 dimensi**.
- Kolom `vector(3072)` HARUS cocok.
- NOTE: `text-embedding-004` / `embedding-001` keduanya **404** pada `embedContent` untuk API key ini — pakai `gemini-embedding-001`.
- `gemini-embedding-2` juga 3072 (default). Tidak ada model Gemini 768-d yang tersedia untuk key ini.

## 5. Index
- **TIDAK ADA ANN index** saat ini. pgvector di build Supabase ini membatasi index ANN (ivfflat/hnsw) maksimal **2000 dimensi**; `gemini-embedding-001` = 3072 → kelebihan batas.
- Retrieval pakai **exact cosine scan** via `match_docs` (`order by embedding <=> q`). Untuk demo-scale (puluhan–ribuan chunk) ini instan & 100% recall.
- Kalau butuh ANN speedup di skala besar: ganti ke model ≤2000-d (mis. set `outputDimensionality` via raw Google SDK — langchain wrapper tidak forward param tsb) atau pindah ke vector DB yang support high-dim ANN.

## 6. Similarity Search
- Operator `<=>` = cosine distance. `1 - (embedding <=> q)` = cosine similarity.
- `match_docs(q, k)` mengembalikan top-k by similarity.

## 7. Row Level Security (RLS)
- RLS **ENABLED** (secure default).
- Aplikasi akses via **SERVICE_ROLE_KEY** → bypass RLS otomatis (aman).
- Anon/authenticated key tidak digunakan di demo ini.
- Kalau suatu saat pakai anon key dari client, tambahkan policy eksplisit.

## 8. Insert Notes
- Embedding dikirim sebagai `number[]` (supabase-js serialize → PostgREST cast ke `vector`).
- Kalau error casting, ubah ke string `'[0.12, 0.34, ...]'` (Postgres terima text representation).
- Gunakan service_role key (bukan anon) agar insert lolos RLS.

## 9. Verifikasi
```bash
node scripts/test-db.mjs        # count = 0 tanpa error
npx tsx scripts/test-ingest.ts  # count>0, embedding non-null, dim=3072
```
