export interface Source {
  id: string;
  source: string;
  chunk_index: number;
  similarity: number;
  content: string;
}

export interface QueryResult {
  answer: string;
  sources: Source[];
  traceId?: string;
}

export interface QueryOptions {
  k?: number;
  skipEval?: boolean;
}

export interface QueryCall {
  question: string;
  opts?: QueryOptions;
}

export const mockQuery = {
  calls: [] as QueryCall[],
  get callCount(): number {
    return this.calls.length;
  },
  implementation: null as ((question: string, opts?: QueryOptions) => Promise<QueryResult>) | null,
  mockReturnValue: { answer: "Default stub answer", sources: [] } as QueryResult,
  mockError: null as Error | null,

  reset(): void {
    this.calls = [];
    this.implementation = null;
    this.mockReturnValue = { answer: "Default stub answer", sources: [] };
    this.mockError = null;
  },

  mockResolvedValue(val: QueryResult): void {
    this.mockReturnValue = val;
    this.mockError = null;
    this.implementation = null;
  },

  mockRejectedValue(err: Error): void {
    this.mockError = err;
    this.implementation = null;
  },
};

export async function query(
  question: string,
  opts?: QueryOptions,
): Promise<QueryResult> {
  mockQuery.calls.push({ question, opts });
  if (mockQuery.mockError) {
    throw mockQuery.mockError;
  }
  if (mockQuery.implementation) {
    return mockQuery.implementation(question, opts);
  }
  return mockQuery.mockReturnValue;
}
