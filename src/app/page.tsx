"use client";

import { useState } from "react";

interface Source {
  id: string;
  source: string;
  chunk_index: number;
  similarity: number;
  content: string;
}

interface QueryResponse {
  answer: string;
  sources: Source[];
  traceId?: string;
}

// Render answer text, turning inline [[n]] markers into anchors that jump to
// the matching source card (faithful citation navigation).
function renderAnswer(answer: string) {
  const parts = answer.split(/(\[\[\d+\]\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[\[(\d+)\]$/);
    if (m) {
      const n = m[1];
      return (
        <a
          key={i}
          href={`#source-${n}`}
          className="mx-0.5 rounded bg-blue-100 px-1 text-blue-700 align-super text-xs font-semibold no-underline hover:bg-blue-200"
        >
          {n}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ingest form
  const [ingestText, setIngestText] = useState("");
  const [ingestSource, setIngestSource] = useState("");
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data as QueryResponse);
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!ingestText.trim() || ingesting) return;
    setIngesting(true);
    setIngestMsg(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ingestText,
          source: ingestSource.trim() || "pasted-doc",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setIngestMsg(`Ingested ${data.inserted} chunk(s) from "${data.source}".`);
      setIngestText("");
    } catch (e) {
      setIngestMsg(`Error: ${(e as Error).message}`);
    } finally {
      setIngesting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">RAG Knowledge Bot</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ask questions over your indexed documents. Answers are grounded in retrieved
          chunks with inline citations.
        </p>
      </header>

      {/* Ingest */}
      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="mb-2 text-sm font-medium text-zinc-700">Add a document</h2>
        <form onSubmit={handleIngest} className="flex flex-col gap-2">
          <input
            value={ingestSource}
            onChange={(e) => setIngestSource(e.target.value)}
            placeholder="source name (e.g. notes.md)"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <textarea
            value={ingestText}
            onChange={(e) => setIngestText(e.target.value)}
            placeholder="Paste document text here..."
            rows={4}
            className="resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={ingesting}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {ingesting ? "Ingesting..." : "Ingest"}
          </button>
        </form>
        {ingestMsg && <p className="mt-2 text-xs text-zinc-500">{ingestMsg}</p>}
      </section>

      {/* Ask */}
      <section className="flex flex-col gap-4">
        <form onSubmit={handleAsk} className="flex flex-col gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question..."
            rows={3}
            className="resize-y rounded-lg border border-zinc-300 px-4 py-3 text-base outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="self-start rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Thinking..." : "Ask"}
          </button>
        </form>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-[15px] leading-7 whitespace-pre-wrap">
              {renderAnswer(result.answer)}
            </div>

            {result.traceId && (
              <a
                href={`https://cloud.langfuse.com/trace/${result.traceId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                View trace in Langfuse ↗
              </a>
            )}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Sources ({result.sources.length})
              </h3>
              <ol className="flex flex-col gap-2">
                {result.sources.map((s, i) => (
                  <li
                    key={s.id}
                    id={`source-${i + 1}`}
                    className="scroll-mt-4 rounded-lg border border-zinc-200 p-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">
                        [{i + 1}] {s.source}
                        <span className="ml-1 text-zinc-400">· chunk {s.chunk_index}</span>
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono">
                        sim {s.similarity.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm text-zinc-600">{s.content}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
