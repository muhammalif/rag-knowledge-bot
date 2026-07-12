# API Reference — RAG Knowledge Bot

## POST /api/query

Request body:

```json
{ "question": "string (required)", "k": "number (optional, default 4)" }
```

Response `200`:

```jsonc
{
  "answer": "string — grounded answer with [[n]] inline citations",
  "sources": [
    {
      "id": "string",
      "source": "string — original doc name",
      "chunk_index": "number",
      "similarity": "number — cosine similarity in (0,1]",
      "content": "string — retrieved chunk text"
    }
  ],
  "traceId": "string — Langfuse trace id; deep-link: https://cloud.langfuse.com/trace/<traceId>"
}
```

- Inline citations `[[n]]` in `answer` map 1:1 to the n-th entry in `sources` (1-indexed).
- `sources` are the real retrieved chunks (faithful citations), not LLM-invented.
- `traceId` is present whenever Langfuse is configured; omitted if keys are missing.

Errors: `400` (empty question), `500` (upstream/embedding/LLM failure).

## POST /api/ingest

Request body:

```json
{ "text": "string (required)", "source": "string (optional, defaults to 'pasted-doc')" }
```

Response `200`:

```json
{ "inserted": "number — chunks stored", "source": "string" }
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server. |
| `npm run build` / `npm run start` | Production build / serve. |
| `npm run test:split` | Verify chunking (size/overlap). |
| `npm run test:ingest` | Ingest a sample document into pgvector. |
| `npm run test:query` | Run a real RAG query (needs Gemini + Supabase). |
| `npm run test:monitor` | Run a query and verify a Langfuse trace arrives (needs Langfuse keys). |

## Environment (`.env.local`, server-only)

```
GEMINI_API_KEY=...
SUPABASE_URL=...
SUPABASE_KEY=...
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

`LANGFUSE_*` are optional — without them, tracing is skipped and the app still works.
