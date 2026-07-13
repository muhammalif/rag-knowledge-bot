/**
 * Golden Q&A set (ground-truth baseline) for the RAG Knowledge Bot.
 *
 * Each item is a question whose answer the bot SHOULD be able to produce from the
 * ingested knowledge base (interview_prep_master.md). `expectedAnswer` is the
 * ground-truth the correctness judge compares the generated answer against.
 *
 * Used by `scripts/test-golden.ts` to run an offline regression eval:
 *   faithfulness (grounded in context) + answer_relevance (addresses question)
 *   + correctness (covers expected key facts).
 *
 * To extend: add more { question, expectedAnswer } pairs grounded in the KB.
 */
export interface GoldenQA {
  question: string;
  expectedAnswer: string;
}

export const goldenQA: GoldenQA[] = [
  {
    question: "Apa itu context engineering dan bagaimana bedanya dengan prompt engineering?",
    expectedAnswer:
      "Context engineering adalah kurasi dan manajemen seluruh informasi yang masuk ke context window — system prompt, retrieved docs, history, dan tool schemas — agar context pas dan relevan di setiap turn. Bedanya dengan prompt engineering: prompt engineering mengoptimasi satu prompt statis, sedangkan context engineering mengorkestrasi SELURUH informasi dinamis per turn.",
  },
  {
    question: "Jelaskan langkah-langkah utama pada arsitektur RAG (Retrieval-Augmented Generation).",
    expectedAnswer:
      "Langkah RAG: (1) load & chunk dokumen, misal dengan RecursiveCharacterTextSplitter (chunkSize ~1000, overlap ~200); (2) buat embedding lalu simpan ke vector store (MemoryVectorStore, pgvector, Pinecone); (3) similaritySearch(query, k) untuk mengambil chunk relevan; (4) masukkan chunk ke prompt <context> lalu LLM generate jawaban.",
  },
  {
    question: "Apa itu PagedAttention dalam vLLM dan apa fungsinya?",
    expectedAnswer:
      "vLLM adalah engine LLM inference high-throughput yang open-source. Intinya PagedAttention — manajemen KV-cache ala virtual memory yang menghemat VRAM — ditambah continuous batching. Cocok saat self-host model open (Llama/Qwen/Mistral) untuk kontrol data/cost, butuh throughput tinggi, dan banyak user.",
  },
  {
    question: "Apa perbedaan antara gemini-2.5-flash dan gemini-2.5-pro?",
    expectedAnswer:
      "gemini-2.5-flash itu murah, cepat, dan ada free tier (default produksi). gemini-2.5-pro itu kualitas tinggi tapi paid per-token. Bedanya dengan OpenAI: Gemini multimodal native (image/audio/video dalam 1 model) dan punya context window 1 juta+ token (vs GPT sekitar 128–200k).",
  },
  {
    question: "Sebutkan metric wajib untuk AI observability dan evaluasi pasca-deployment.",
    expectedAnswer:
      "Metric wajib: Latency P95 (95% request lebih cepat dari nilai ini, bukan rata-rata), Token cost (input/output × harga → $/request), Faithfulness (RAGAS — jawaban stick ke context, tidak ngarang), Answer relevancy (nyambung ke pertanyaan), dan Hallucination rate (% klaim salah di luar source).",
  },
  {
    question: "Dalam konteks evaluasi RAG, apa itu answer relevancy?",
    expectedAnswer:
      "Answer relevancy adalah metric yang mengukur apakah jawaban yang dihasilkan sistem benar-benar nyambung dan menjawab pertanyaan user, terlepas dari apakah jawaban itu groundeded ke source. Berbeda dengan faithfulness yang mengecek kesesuaian ke context.",
  },
  {
    question: "Bagaimana cara menjalankan model lokal dengan Ollama secara OpenAI-compatible?",
    expectedAnswer:
      "Ollama adalah LLM lokal yang OpenAI-compatible (api_key diabaikan). Jalankan server lokal, lalu panggil dengan base_url http://localhost:11434/v1/ dan api_key 'ollama'. Untuk embeddings pakai POST http://localhost:11434/api/embed dengan field model dan input.",
  },
  {
    question: "Apa perbedaan Langfuse, LangSmith, dan Helicone untuk observability?",
    expectedAnswer:
      "Langfuse itu OSS dan self-hostable (MIT) dengan LLM-as-judge, fokus ke privacy/budget. LangSmith itu managed observability + eval yang matang untuk tracing agent/chains. Helicone itu gateway + observability ringan yang mem-proxy OpenAI/Anthropic, cepat untuk cek cost/latency.",
  },
  {
    question: "Apa itu faithfulness dalam metrik RAGAS?",
    expectedAnswer:
      "Faithfulness (RAGAS) mengukur apakah jawaban RAG benar-benar stick ke context yang di-retrieve dan tidak mengarang (tidak halu). Jawaban dianggap faithful bila semua klaimnya didukung oleh context sumber.",
  },
  {
    question: "Apa itu LangGraph dan bagaimana bedanya dengan Langchain biasa?",
    expectedAnswer:
      "Langchain adalah framework untuk build LLM apps (models, prompts, chains, agents, retrievers, vector stores). LangGraph adalah orchestration framework untuk agent yang long-running dan stateful, berbasis Graph = nodes + edges + state (misal state pakai TypedDict dengan add_messages).",
  },
];
