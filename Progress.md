# Progress — RAG Knowledge Bot

**Status: ✅ All 5 steps complete (MVP shippable).**

| Step | Scope | Status | Notes |
|------|-------|--------|-------|
| 1 | Setup (Next.js, env, Supabase/pgvector) | ✅ | App Router + TS; `GEMINI_API_KEY` + `SUPABASE_URL`/`SUPABASE_KEY`; pgvector table `documents`. |
| 2 | Ingest (chunk → embed → store) | ✅ | `RecursiveCharacterTextSplitter` (1000/200); Gemini embeddings; pgvector upsert. |
| 3 | Retrieve + Generate (RAG + citations) | ✅ | similarity search → context → Gemini answer + `[[n]]` inline citations. |
| 4 | UI (Next.js) | ✅ | Ingest form + ask box; renders answer with citation anchors + source cards. |
| 5 | Monitoring (Langfuse) | ✅ | OTel provider + `@langfuse/langchain` `CallbackHandler` on generation; trace id surfaced in UI. |

## Verification

- `npm run test:split` — chunking sane (size/overlap).
- `npm run test:ingest` — rows inserted into pgvector.
- `npm run test:query` — grounded answer + real retrieved sources.
- `npm run test:monitor` — trace arrives in Langfuse (token cost + latency auto-captured).
- `npm run build` — production build passes.

## Next (post-MVP, optional)

- **Step 6: faithfulness eval** — LLM-as-judge scoring answer against retrieved chunks (closes the "faithfulness" gap from the JD).
- **Ollama local-LLM mode** — inference-engineering plus.
- **Auth / multi-user sessions** — group queries per user.
- **File upload** (PDF/txt) instead of paste.
