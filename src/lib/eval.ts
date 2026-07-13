import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google";
import { ensureRateLimit, callWithRetry } from "./rateLimit";

export interface FaithfulnessResult {
  score: number; // 0..1
  faithful: boolean;
  unsupportedClaims: string[];
  reasoning: string;
}

const JUDGE_SYSTEM = `You are a faithfulness grader for a Retrieval-Augmented Generation (RAG) system.
Given the CONTEXT (retrieved document passages) and the ANSWER produced by the assistant, judge whether the ANSWER is fully supported by the CONTEXT.
Rules:
- A statement in the ANSWER is UNSUPPORTED if it asserts facts, numbers, names, or claims not present in (or contradicting) the CONTEXT.
- Ignore citation markers like [[1]]; they are just references.
- Be strict: if any material claim is unsupported, the answer is not fully faithful.
Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{"faithful": boolean, "score": number between 0 and 1, "unsupported_claims": string[], "reasoning": string}`;

/**
 * LLM-as-judge faithfulness check: is the generated `answer` grounded in the
 * retrieved `contexts`? Returns a 0..1 score plus any unsupported claims.
 */
export async function evaluateFaithfulness(
  answer: string,
  contexts: string[],
): Promise<FaithfulnessResult> {
  if (contexts.length === 0) {
    return {
      score: 0,
      faithful: false,
      unsupportedClaims: ["No context provided"],
      reasoning: "No retrieved context to grade against.",
    };
  }

  const context = contexts.join("\n\n---\n\n");
  const judge = new ChatGoogle({
    model: "gemini-flash-latest",
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY,
  });

  await ensureRateLimit();
  const res = await callWithRetry(() => judge.invoke([
    new SystemMessage(JUDGE_SYSTEM),
    new HumanMessage(`CONTEXT:\n${context}\n\nANSWER:\n${answer}`),
  ]));

  return parseFaithfulness(res.content.toString());
}

interface RawJudge {
  faithful?: boolean;
  score?: number;
  unsupported_claims?: unknown;
  reasoning?: string;
}

function parseFaithfulness(raw: string): FaithfulnessResult {
  try {
    const parsed = extractJson(raw) as RawJudge;
    const rawScore = typeof parsed.score === "number" ? parsed.score : parsed.faithful ? 1 : 0;
    const score = Math.max(0, Math.min(1, rawScore));
    const claims = Array.isArray(parsed.unsupported_claims)
      ? parsed.unsupported_claims.map((c) => String(c))
      : [];
    return {
      score,
      faithful: typeof parsed.faithful === "boolean" ? parsed.faithful : score >= 0.5,
      unsupportedClaims: claims,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return {
      score: 0,
      faithful: false,
      unsupportedClaims: [],
      reasoning: "Failed to parse judge output.",
    };
  }
}

export interface AnswerRelevanceResult {
  score: number; // 0..1
  relevant: boolean;
  reasoning: string;
}

const RELEVANCE_SYSTEM = `You are an answer-relevance grader for a RAG system.
Given the QUESTION and the ASSISTANT'S ANSWER, judge whether the answer actually addresses the question.
Rules:
- Focus ONLY on relevance to the question. Do NOT judge factual correctness or source grounding (those are graded separately).
- Score 1.0 if the answer directly and completely addresses the question.
- Score lower if the answer is partially off-topic, vague, ignores part of the question, or answers a different question.
- Score 0.0 if the answer does not address the question at all.
Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{"relevant": boolean, "score": number between 0 and 1, "reasoning": string}`;

/**
 * LLM-as-judge answer-relevance check: does the generated `answer` address the
 * `question`? This is independent of faithfulness (source grounding) — an answer
 * can be well-grounded yet irrelevant to what was asked, and vice versa.
 */
export async function evaluateAnswerRelevance(
  question: string,
  answer: string,
): Promise<AnswerRelevanceResult> {
  if (!answer.trim()) {
    return { score: 0, relevant: false, reasoning: "Empty answer." };
  }

  const judge = new ChatGoogle({
    model: "gemini-flash-latest",
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY,
  });

  await ensureRateLimit();
  const res = await callWithRetry(() => judge.invoke([
    new SystemMessage(RELEVANCE_SYSTEM),
    new HumanMessage(`QUESTION:\n${question}\n\nANSWER:\n${answer}`),
  ]));

  return parseAnswerRelevance(res.content.toString());
}

interface RawRelevance {
  relevant?: boolean;
  score?: number;
  reasoning?: string;
}

function parseAnswerRelevance(raw: string): AnswerRelevanceResult {
  try {
    const parsed = extractJson(raw) as RawRelevance;
    const rawScore = typeof parsed.score === "number" ? parsed.score : parsed.relevant ? 1 : 0;
    const score = Math.max(0, Math.min(1, rawScore));
    return {
      score,
      relevant: typeof parsed.relevant === "boolean" ? parsed.relevant : score >= 0.5,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return { score: 0, relevant: false, reasoning: "Failed to parse judge output." };
  }
}

export interface CorrectnessResult {
  score: number; // 0..1 — coverage of expected key facts
  correct: boolean;
  missingFacts: string[];
  reasoning: string;
}

const CORRECTNESS_SYSTEM = `You are a correctness grader for a RAG system's golden-set evaluation.
You are given the QUESTION, the EXPECTED ANSWER (ground-truth), and the GENERATED ANSWER (produced by the system).
Judge whether the GENERATED ANSWER captures the key facts required by the EXPECTED ANSWER.
Rules:
- The generated answer does NOT need to match the expected answer word-for-word; it must cover the same key facts.
- List any important facts present in the EXPECTED ANSWER but MISSING or contradicted in the GENERATED ANSWER.
- Minor wording differences are fine. Hallucinations in the generated answer should lower the score.
Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{"correct": boolean, "score": number between 0 and 1, "missing_facts": string[], "reasoning": string}`;

/**
 * LLM-as-judge correctness check against a golden (expected) answer. Used by the
 * golden-set regression eval (scripts/test-golden.ts); requires a known expected
 * answer, so it is NOT part of the live request path.
 */
export async function evaluateCorrectness(
  question: string,
  expectedAnswer: string,
  generatedAnswer: string,
): Promise<CorrectnessResult> {
  if (!generatedAnswer.trim()) {
    return {
      score: 0,
      correct: false,
      missingFacts: ["No generated answer."],
      reasoning: "Empty generated answer.",
    };
  }

  const judge = new ChatGoogle({
    model: "gemini-flash-latest",
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY,
  });

  await ensureRateLimit();
  const res = await callWithRetry(() => judge.invoke([
    new SystemMessage(CORRECTNESS_SYSTEM),
    new HumanMessage(
      `QUESTION:\n${question}\n\nEXPECTED ANSWER:\n${expectedAnswer}\n\nGENERATED ANSWER:\n${generatedAnswer}`,
    ),
  ]));

  return parseCorrectness(res.content.toString());
}

interface RawCorrectness {
  correct?: boolean;
  score?: number;
  missing_facts?: unknown;
  reasoning?: string;
}

function parseCorrectness(raw: string): CorrectnessResult {
  try {
    const parsed = extractJson(raw) as RawCorrectness;
    const rawScore = typeof parsed.score === "number" ? parsed.score : parsed.correct ? 1 : 0;
    const score = Math.max(0, Math.min(1, rawScore));
    const missing = Array.isArray(parsed.missing_facts)
      ? parsed.missing_facts.map((c) => String(c))
      : [];
    return {
      score,
      correct: typeof parsed.correct === "boolean" ? parsed.correct : score >= 0.5,
      missingFacts: missing,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return {
      score: 0,
      correct: false,
      missingFacts: [],
      reasoning: "Failed to parse judge output.",
    };
  }
}

export interface CombinedEvalResult {
  faithfulness: FaithfulnessResult;
  answerRelevance: AnswerRelevanceResult;
  correctness: CorrectnessResult;
}

const COMBINED_SYSTEM = `You are a grader for a Retrieval-Augmented Generation (RAG) system.
You are given the QUESTION, the CONTEXT (retrieved document passages), the GENERATED ANSWER, and the EXPECTED ANSWER (golden ground-truth).
Grade the GENERATED ANSWER on THREE independent dimensions:
1. faithfulness (0..1): is the GENERATED ANSWER fully supported by the CONTEXT? List any unsupported material claims in "unsupported_claims". Ignore [[n]] citation markers.
2. answer_relevance (0..1): does the GENERATED ANSWER actually address the QUESTION? (Do not judge grounding or correctness here.)
3. correctness (0..1): does the GENERATED ANSWER cover the key facts required by the EXPECTED ANSWER? List any important EXPECTED facts that are MISSING or contradicted in "missing_facts".
Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{
  "faithfulness": {"score": number 0..1, "unsupported_claims": string[], "reasoning": string},
  "answer_relevance": {"score": number 0..1, "reasoning": string},
  "correctness": {"score": number 0..1, "missing_facts": string[], "reasoning": string}
}`;

/**
 * Combined LLM-as-judge: grades faithfulness + answer_relevance + correctness in a
 * SINGLE LLM call. Used by the golden-set eval (scripts/test-golden.ts) to keep the
 * call budget low on the free tier (3 calls/item instead of 5).
 */
export async function evaluateAll(
  question: string,
  answer: string,
  contexts: string[],
  expectedAnswer: string,
): Promise<CombinedEvalResult> {
  if (!answer.trim()) {
    return {
      faithfulness: { score: 0, faithful: false, unsupportedClaims: ["Empty answer."], reasoning: "" },
      answerRelevance: { score: 0, relevant: false, reasoning: "Empty answer." },
      correctness: { score: 0, correct: false, missingFacts: ["No generated answer."], reasoning: "" },
    };
  }
  const context = contexts.join("\n\n---\n\n");
  const judge = new ChatGoogle({
    model: "gemini-flash-latest",
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY,
  });

  await ensureRateLimit();
  const res = await callWithRetry(() => judge.invoke([
    new SystemMessage(COMBINED_SYSTEM),
    new HumanMessage(
      `QUESTION:\n${question}\n\nCONTEXT:\n${context}\n\nEXPECTED ANSWER:\n${expectedAnswer}\n\nGENERATED ANSWER:\n${answer}`,
    ),
  ]));

  return parseCombined(res.content.toString());
}

interface RawCombined {
  faithfulness?: { score?: number; unsupported_claims?: unknown; reasoning?: string };
  answer_relevance?: { score?: number; reasoning?: string };
  correctness?: { score?: number; missing_facts?: unknown; reasoning?: string };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function parseCombined(raw: string): CombinedEvalResult {
  try {
    const p = extractJson(raw) as RawCombined;
    const faith = p.faithfulness ?? {};
    const rel = p.answer_relevance ?? {};
    const corr = p.correctness ?? {};
    const fScore = clamp01(typeof faith.score === "number" ? faith.score : 0);
    const rScore = clamp01(typeof rel.score === "number" ? rel.score : 0);
    const cScore = clamp01(typeof corr.score === "number" ? corr.score : 0);
    return {
      faithfulness: {
        score: fScore,
        faithful: fScore >= 0.5,
        unsupportedClaims: Array.isArray(faith.unsupported_claims)
          ? faith.unsupported_claims.map((c) => String(c))
          : [],
        reasoning: typeof faith.reasoning === "string" ? faith.reasoning : "",
      },
      answerRelevance: {
        score: rScore,
        relevant: rScore >= 0.5,
        reasoning: typeof rel.reasoning === "string" ? rel.reasoning : "",
      },
      correctness: {
        score: cScore,
        correct: cScore >= 0.5,
        missingFacts: Array.isArray(corr.missing_facts)
          ? corr.missing_facts.map((c) => String(c))
          : [],
        reasoning: typeof corr.reasoning === "string" ? corr.reasoning : "",
      },
    };
  } catch {
    return {
      faithfulness: { score: 0, faithful: false, unsupportedClaims: [], reasoning: "parse error" },
      answerRelevance: { score: 0, relevant: false, reasoning: "parse error" },
      correctness: { score: 0, correct: false, missingFacts: [], reasoning: "parse error" },
    };
  }
}

function extractJson(s: string): Record<string, unknown> {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found");
  }
  return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
}
