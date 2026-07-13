# API Reference — RAG Knowledge Bot

> Kontrak response di bawah sudah **diimplementasikan** (Steps 2–3, diperluas Steps 5–6). Lihat juga `docs/Architecture.md`.

## POST /api/ingest
Ingest sebuah dokumen (teks) menjadi chunk + embedding.

**Request**
```json
{ "text": "konten dokumen...", "source": "interview_prep_master.md" }
```
- `source` opsional; default `"unknown"` (atau `"pasted-doc"` bila dari UI).

**Behavior**
1. Split `text` → chunks (`RecursiveCharacterTextSplitter`, 1000/200).
2. Embed tiap chunk (`gemini-embedding-001`, 3072d).
3. Insert ke `documents` (`content`, `metadata{source,chunk_index}`, `embedding vector(3072)`).

**Response `201`**
```json
{ "source": "interview_prep_master.md", "chunks": 42, "inserted": 42 }
```

**Errors**
- `400` — `text` kosong.
- `500` — gagal embed/insert (lihat message).

---

## POST /api/query
Jawab pertanyaan dari knowledge base dengan citation + faithfulness score.

**Request**
```json
{ "question": "Apa itu context engineering?", "k": 4 }
```
- `k` opsional (default 4).

**Behavior**
1. Embed `question` (`gemini-embedding-001`, 3072d).
2. `match_docs(k)` RPC → top-k chunk by cosine similarity (exact scan, `vector(3072)`).
3. `ChatGoogle` (`gemini-flash-latest`) generate jawaban grounded + citation inline `[[n]]` ke chunk.
4. `sources` = chunk ASLI yang di-retrieve (faithful citation), bukan hasil parse JSON LLM.
5. `evaluateFaithfulness(answer, contexts)` → score 0..1 (LLM-judge Gemini temp 0).

**Response `200`**
```json
{
  "answer": "Context engineering adalah ...",
  "sources": [
    { "id": "uuid", "source": "interview_prep_master.md", "chunk_index": 3, "similarity": 0.91, "content": "..." }
  ],
  "traceId": "9f03991a...",
  "faithfulness": {
    "score": 1,
    "faithful": true,
    "unsupportedClaims": [],
    "reasoning": "All claims supported by context."
  }
}
```
- Inline citations `[[n]]` di `answer` map 1:1 ke n-th entry `sources` (1-indexed).
- `traceId` ada bila Langfuse configured; di-skip bila keys hilang.
- `faithfulness` selalu dihitung; `score` juga di-POST ke Langfuse (`/api/public/scores`).

**Errors**
- `400` — `question` kosong.
- `500` — gagal embed / retrieve / generate.

---

## Monitoring
- Semua generate call di-wrap `CallbackHandler` Langfuse (via global OTel `TracerProvider`) → trace di dashboard (model, token, latency).
- Faithfulness score di-POST ke trace yang sama (`scoreTrace`).
- Dashboard: token cost, latency, faithfulness per query.

---

## Scripts
| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (http://localhost:3000). |
| `npm run build` / `npm run start` | Production build / serve. |
| `npm run test:split` | Verify chunking (size/overlap). |
| `npm run test:ingest` | Verify ingested rows: embedding non-null & 3072-d, metadata present. |
| `npm run test:query` | Run a real RAG query (needs Gemini + Supabase). |
| `npm run test:monitor` | Run a query, verify Langfuse trace arrives (needs Langfuse keys). |
| `npm run test:eval` | Run a query, grade faithfulness, verify score lands in Langfuse. |

## Environment (`.env.local`, server-only)
```
GEMINI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com   # dibaca observability.ts (fallback LANGFUSE_HOST)
```
`LANGFUSE_*` opsional — tanpa itu, tracing di-skip & app tetap jalan.
