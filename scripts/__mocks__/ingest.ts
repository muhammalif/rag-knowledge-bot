export interface IngestResult {
  source: string;
  chunks: number;
  inserted: number;
}

export interface IngestCall {
  text: string;
  source: string;
}

export const mockIngest = {
  calls: [] as IngestCall[],
  get callCount(): number {
    return this.calls.length;
  },
  implementation: null as ((text: string, source: string) => Promise<IngestResult>) | null,
  mockReturnValue: { source: "unknown", chunks: 1, inserted: 1 } as IngestResult,
  mockError: null as Error | null,

  reset(): void {
    this.calls = [];
    this.implementation = null;
    this.mockReturnValue = { source: "unknown", chunks: 1, inserted: 1 };
    this.mockError = null;
  },

  mockResolvedValue(val: IngestResult): void {
    this.mockReturnValue = val;
    this.mockError = null;
    this.implementation = null;
  },

  mockRejectedValue(err: Error): void {
    this.mockError = err;
    this.implementation = null;
  },
};

export async function ingestDocument(
  text: string,
  source: string,
): Promise<IngestResult> {
  mockIngest.calls.push({ text, source });
  if (mockIngest.mockError) {
    throw mockIngest.mockError;
  }
  if (mockIngest.implementation) {
    return mockIngest.implementation(text, source);
  }
  return mockIngest.mockReturnValue;
}
