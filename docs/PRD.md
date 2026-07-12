# PRD — RAG Knowledge Bot

## 1. Latar Belakang
Muhammad Alif Islam sedang prepare interview HR untuk posisi **AI Engineer (Applied AI)** — peran yang menjembatani technical AI development dan business outcome. CV saat ini punya kekuatan di fullstack JS/TS + Python, OpenAI API, context engineering, dan shipping end-to-end, tapi belum punya *shipped AI-wrapper product* konkret serta familaritas di Langchain/Ollama/vLLM/Gemini, AI eval/observability, dan SDLC/testing.

Bot ini dibuat sebagai **portfolio piece** untuk menutup gap tersebut secara visual dan teknis.

- JD: https://www.linkedin.com/jobs/view/4424220157/
- Inti JD: build AI-powered solutions (context engineering, LLM integration, AI pipeline), eksperimen RAG, terjemahkan bisnis ambigu → hipotesis teknis, monitor AI post-deployment, kolaborasi cross-functional, champion SDLC.

## 2. Tujuan Produk
Bot knowledge berbasis RAG yang:
1. Menerima upload dokumen (markdown/text).
2. Memecah, meng-embed, dan menyimpan ke vector store.
3. Menjawab pertanyaan user dengan mengambil konteks relevan + **citation ke sumber**.
4. Mencatat setiap langkah (token, latency, faithfulness) ke sistem observability.

## 3. Target User
- **Primer**: User sendiri (alat QA catatan pribadi).
- **Sekunder**: interviewer — bot dipoles jadi demo yang rapi dan bisa di-deploy.

## 4. Fitur (MVP → Stretch)
| # | Fitur | Prioritas | Step |
|---|-------|-----------|------|
| F1 | Ingest dokumen → chunk → embed → simpan | MVP | 2 |
| F2 | Query → retrieve → generate jawaban + citation | MVP | 3 |
| F3 | UI chat (input + jawaban + daftar sumber) | MVP | 4 |
| F4 | Monitoring trace (cost/latency/faithfulness) | MVP | 5 |
| F5 | Eval set golden Q&A + skor | Stretch | 6 |
| F6 | Upload doc bebas via UI (bukan cuma seed) | Stretch | 4 |

## 5. Success Criteria
- **Minimal**: upload → tanya → jawab + citation sumber jalan.
- **Plus**: Langfuse trace kelihatan (cost / latency P95 / faithfulness).
- **Stretch**: mini eval set 5–10 Q&A golden → faithfulness ≥ 0.8 & answer relevance ≥ 0.8.
- Deploy: Vercel + Supabase cloud (interviewer bisa buka link live).

## 6. Scope
- **In**: RAG sederhana, 1 collection dokumen, citation via JSON output LLM, Langfuse observability, eval set kecil.
- **Out (non-goals)**: multi-user auth, RBAC, fine-tuning, agentic multi-hop reasoning, production-scale indexing, streaming (bisa stretch).

## 7. Pemetaan ke JD (interview narrative)
| Capability di JD | Bukti dari bot |
|------------------|----------------|
| Context engineering | chunking strategy + prompt dgn citation instruction |
| LLM integration / AI pipeline | Langchain orchestration Gemini |
| RAG experimentation | pgvector retrieve + generate |
| Monitor AI post-deployment | Langfuse trace + eval set |
| Champion testing / SDLC | TDD per step, eval suite |
| Translate bisnis → hipotesis teknis | PRD/Scope terdefinisi jelas |

## 8. Constraints
- Model mulai Gemini Flash (free tier) — biaya 0 dulu.
- Waktu: belajar & build bertahap, bukan sekali jalan.
- User yang coding; MAI (Hermes) bimbing step-by-step.

## 9. Risiko
- Next.js 16 bleeding edge → konvensi route/UI beda dari training data.
- `@langchain/google` v0.2.1 baru → API chat bisa berubah (pakai `ChatGoogle`).
- Embedding 3072-d (`gemini-embedding-001`) harus konsisten dgn `vector(3072)`; ANN index di-drop (pgvector cap 2000-dim) → exact cosine scan.
