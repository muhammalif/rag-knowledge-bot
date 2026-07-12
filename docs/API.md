# API Reference — RAG Knowledge Bot

> Kontrak response bersifat *planned* untuk Step 2–3; implementasi mengikuti `docs/Architecture.md`.

## POST /api/ingest
Ingest sebuah dokumen (teks) menjadi chunk + embedding.

**Request**
```json
{ "text": "konten dokumen...", "source": "interview_prep_master.md" }
```

**Behavior**
1. Split `text` → chunks (`RecursiveCharacterTextSplitter`, 1000/200).
2. Embed tiap chunk (`gemini-embedding-001`, 3072d).
3. Insert ke `documents` (`content`, `metadata{sources,chunk_index}`, `embedding`).

**Response**
```json
{ "ok": true, "chunks": 42 }
```

**Errors**
- `400` — `text` / `source` kosong.
- `500` — gagal embed/insert (lihat message).

---

## POST /api/query
Jawab pertanyaan dari knowledge base dengan citation.

**Request**
```json
{ "question": "Apa itu context engineering?" }
```

**Behavior**
1. Embed `question` (`gemini-embedding-001`, 3072d).
2. `match_docs(k=4)` RPC → top-4 chunk by cosine similarity (exact scan, `vector(3072)`).
3. `ChatGoogle` (gemini-flash-latest) generate jawaban grounded + citation inline `[[n]]` ke chunk.
4. `sources` = chunk ASLI yang di-retrieve (faithful citation), bukan hasil parse JSON LLM.

**Response**
```json
{
  "answer": "Context engineering adalah ...",
  "sources": [
    { "id": "uuid", "source": "interview_prep_master.md", "chunk_index": 3, "similarity": 0.91, "content": "..." }
  ]
}
```

**Monitoring**
- Semua call (embed + generate) di-wrap `CallbackHandler` Langfuse → trace di dashboard.

---

## Health
`scripts/test-db.mjs` — bukan HTTP endpoint, tapi script verifikasi koneksi DB (count `documents`).
