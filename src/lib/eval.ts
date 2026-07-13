import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google";

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

  const res = await judge.invoke([
    new SystemMessage(JUDGE_SYSTEM),
    new HumanMessage(`CONTEXT:\n${context}\n\nANSWER:\n${answer}`),
  ]);

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

function extractJson(s: string): Record<string, unknown> {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found");
  }
  return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
}
