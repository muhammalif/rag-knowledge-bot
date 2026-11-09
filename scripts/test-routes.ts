import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { NextRequest } from "next/server";

// Node 24 module.registerHooks declaration for @types/node@20
declare module "node:module" {
  export function registerHooks(hooks: {
    resolve?: (
      specifier: string,
      context: unknown,
      nextResolve: (specifier: string, context: unknown) => unknown
    ) => unknown;
    load?: (
      url: string,
      context: unknown,
      nextLoad: (url: string, context: unknown) => unknown
    ) => unknown;
  }): void;
}

const baseDir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(new URL(import.meta.url).pathname);
const mockIngestPath = path.resolve(baseDir, "__mocks__/ingest.ts");
const mockQueryPath = path.resolve(baseDir, "__mocks__/query.ts");

const mockIngestUrl = pathToFileURL(mockIngestPath).href;
const mockQueryUrl = pathToFileURL(mockQueryPath).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/ingest") {
      return { url: mockIngestUrl, format: "module", shortCircuit: true };
    }
    if (specifier === "@/lib/query") {
      return { url: mockQueryUrl, format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createRequest(url: string, body?: unknown, raw = false): NextRequest {
  const init = {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: raw ? (body as string) : body !== undefined ? JSON.stringify(body) : undefined,
  };
  return new NextRequest(url, init);
}

async function main() {
  // Dynamic import required here: registerHooks must be active before route modules
  // and their statically imported @/lib/ingest and @/lib/query dependencies are loaded.
  const { mockIngest } = await import("./__mocks__/ingest");
  const { mockQuery } = await import("./__mocks__/query");
  const { POST: ingestPOST } = await import("@/app/api/ingest/route");
  const { POST: queryPOST } = await import("@/app/api/query/route");

  console.log("=== Running Offline Route Handler Unit Tests ===\n");

  let passedCount = 0;
  let failedCount = 0;

  async function test(name: string, fn: () => Promise<void>) {
    mockIngest.reset();
    mockQuery.reset();
    try {
      await fn();
      console.log(`PASS: ${name}`);
      passedCount++;
    } catch (e) {
      console.error(`FAIL: ${name}`);
      console.error(`  Reason: ${(e as Error).message}`);
      failedCount++;
    }
  }

  // --- POST /api/ingest tests ---
  await test("1. POST /api/ingest: body bukan JSON valid -> 400, error 'Invalid JSON body', ingestDocument TIDAK dipanggil", async () => {
    const req = createRequest("http://localhost:3000/api/ingest", "{not-valid-json", true);
    const res = await ingestPOST(req);
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
    const data = await res.json();
    assert(deepEqual(data, { error: "Invalid JSON body" }), `Expected { error: "Invalid JSON body" }, got ${JSON.stringify(data)}`);
    assert(mockIngest.callCount === 0, `Expected ingestDocument calls to be 0, got ${mockIngest.callCount}`);
  });

  await test("2. POST /api/ingest: body {} (tanpa text) -> 400, pesan menyebut `text`, ingestDocument TIDAK dipanggil", async () => {
    const req = createRequest("http://localhost:3000/api/ingest", {});
    const res = await ingestPOST(req);
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
    const data = await res.json();
    assert(typeof data.error === "string" && data.error.includes("text"), `Expected error mentioning 'text', got ${JSON.stringify(data)}`);
    assert(mockIngest.callCount === 0, `Expected ingestDocument calls to be 0, got ${mockIngest.callCount}`);
  });

  await test("3. POST /api/ingest: body {text: '   '} -> 400, ingestDocument TIDAK dipanggil", async () => {
    const req = createRequest("http://localhost:3000/api/ingest", { text: "   " });
    const res = await ingestPOST(req);
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
    const data = await res.json();
    assert(typeof data.error === "string" && data.error.includes("text"), `Expected error mentioning 'text', got ${JSON.stringify(data)}`);
    assert(mockIngest.callCount === 0, `Expected ingestDocument calls to be 0, got ${mockIngest.callCount}`);
  });

  await test("4. POST /api/ingest: body {text: 'halo'} -> 201, response body = persis nilai balikan ingestDocument, ingestDocument dipanggil ('halo', 'unknown')", async () => {
    const expectedResult = { source: "unknown", chunks: 2, inserted: 2 };
    mockIngest.mockResolvedValue(expectedResult);
    const req = createRequest("http://localhost:3000/api/ingest", { text: "halo" });
    const res = await ingestPOST(req);
    assert(res.status === 201, `Expected status 201, got ${res.status}`);
    const data = await res.json();
    assert(deepEqual(data, expectedResult), `Expected response body ${JSON.stringify(expectedResult)}, got ${JSON.stringify(data)}`);
    assert(mockIngest.callCount === 1, `Expected ingestDocument calls to be 1, got ${mockIngest.callCount}`);
    assert(mockIngest.calls[0].text === "halo", `Expected text 'halo', got '${mockIngest.calls[0].text}'`);
    assert(mockIngest.calls[0].source === "unknown", `Expected source 'unknown', got '${mockIngest.calls[0].source}'`);
  });

  await test("5. POST /api/ingest: body {text: 'halo', source: 'doc.md'} -> 201, dipanggil ('halo', 'doc.md')", async () => {
    const expectedResult = { source: "doc.md", chunks: 4, inserted: 4 };
    mockIngest.mockResolvedValue(expectedResult);
    const req = createRequest("http://localhost:3000/api/ingest", { text: "halo", source: "doc.md" });
    const res = await ingestPOST(req);
    assert(res.status === 201, `Expected status 201, got ${res.status}`);
    const data = await res.json();
    assert(deepEqual(data, expectedResult), `Expected response body ${JSON.stringify(expectedResult)}, got ${JSON.stringify(data)}`);
    assert(mockIngest.callCount === 1, `Expected ingestDocument calls to be 1, got ${mockIngest.callCount}`);
    assert(mockIngest.calls[0].text === "halo", `Expected text 'halo', got '${mockIngest.calls[0].text}'`);
    assert(mockIngest.calls[0].source === "doc.md", `Expected source 'doc.md', got '${mockIngest.calls[0].source}'`);
  });

  await test("6. POST /api/ingest: ingestDocument throw Error('boom') -> 500, response {error: 'boom'}", async () => {
    mockIngest.mockRejectedValue(new Error("boom"));
    const req = createRequest("http://localhost:3000/api/ingest", { text: "halo" });
    const res = await ingestPOST(req);
    assert(res.status === 500, `Expected status 500, got ${res.status}`);
    const data = await res.json();
    assert(deepEqual(data, { error: "boom" }), `Expected { error: "boom" }, got ${JSON.stringify(data)}`);
    assert(mockIngest.callCount === 1, `Expected ingestDocument calls to be 1, got ${mockIngest.callCount}`);
  });

  // --- POST /api/query tests ---
  await test("7. POST /api/query: body bukan JSON valid -> 400, error 'Invalid JSON body', query TIDAK dipanggil", async () => {
    const req = createRequest("http://localhost:3000/api/query", "not-a-json", true);
    const res = await queryPOST(req);
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
    const data = await res.json();
    assert(deepEqual(data, { error: "Invalid JSON body" }), `Expected { error: "Invalid JSON body" }, got ${JSON.stringify(data)}`);
    assert(mockQuery.callCount === 0, `Expected query calls to be 0, got ${mockQuery.callCount}`);
  });

  await test("8. POST /api/query: body {} dan body {question: '   '} -> 400, pesan menyebut `question`, query TIDAK dipanggil", async () => {
    // 8a: body {}
    const reqEmpty = createRequest("http://localhost:3000/api/query", {});
    const resEmpty = await queryPOST(reqEmpty);
    assert(resEmpty.status === 400, `Expected status 400 for {}, got ${resEmpty.status}`);
    const dataEmpty = await resEmpty.json();
    assert(typeof dataEmpty.error === "string" && dataEmpty.error.includes("question"), `Expected error mentioning 'question', got ${JSON.stringify(dataEmpty)}`);
    assert(mockQuery.callCount === 0, `Expected query calls to be 0, got ${mockQuery.callCount}`);

    // 8b: body { question: "   " }
    const reqWhitespace = createRequest("http://localhost:3000/api/query", { question: "   " });
    const resWhitespace = await queryPOST(reqWhitespace);
    assert(resWhitespace.status === 400, `Expected status 400 for whitespace, got ${resWhitespace.status}`);
    const dataWhitespace = await resWhitespace.json();
    assert(typeof dataWhitespace.error === "string" && dataWhitespace.error.includes("question"), `Expected error mentioning 'question', got ${JSON.stringify(dataWhitespace)}`);
    assert(mockQuery.callCount === 0, `Expected query calls to be 0, got ${mockQuery.callCount}`);
  });

  await test("9. POST /api/query: body {question: 'apa itu x'} -> 200, body = {answer, sources} persis nilai balikan query, query dipanggil ('apa itu x', {k: undefined})", async () => {
    const expectedResult = {
      answer: "x adalah sesuatu",
      sources: [
        {
          id: "chunk-1",
          source: "doc.md",
          chunk_index: 0,
          similarity: 0.88,
          content: "x adalah sesuatu",
        },
      ],
    };
    mockQuery.mockResolvedValue(expectedResult);
    const req = createRequest("http://localhost:3000/api/query", { question: "apa itu x" });
    const res = await queryPOST(req);
    assert(res.status === 200, `Expected status 200, got ${res.status}`);
    const data = await res.json();
    assert(deepEqual(data, expectedResult), `Expected response body ${JSON.stringify(expectedResult)}, got ${JSON.stringify(data)}`);
    assert(mockQuery.callCount === 1, `Expected query calls to be 1, got ${mockQuery.callCount}`);
    assert(mockQuery.calls[0].question === "apa itu x", `Expected question 'apa itu x', got '${mockQuery.calls[0].question}'`);
    assert(deepEqual(mockQuery.calls[0].opts, { k: undefined }), `Expected opts { k: undefined }, got ${JSON.stringify(mockQuery.calls[0].opts)}`);
  });

  await test("10. POST /api/query: body {question: 'x', k: 3} -> 200, query dipanggil ('x', {k: 3})", async () => {
    const expectedResult = {
      answer: "jawaban k=3",
      sources: [],
    };
    mockQuery.mockResolvedValue(expectedResult);
    const req = createRequest("http://localhost:3000/api/query", { question: "x", k: 3 });
    const res = await queryPOST(req);
    assert(res.status === 200, `Expected status 200, got ${res.status}`);
    const data = await res.json();
    assert(deepEqual(data, expectedResult), `Expected response body ${JSON.stringify(expectedResult)}, got ${JSON.stringify(data)}`);
    assert(mockQuery.callCount === 1, `Expected query calls to be 1, got ${mockQuery.callCount}`);
    assert(mockQuery.calls[0].question === "x", `Expected question 'x', got '${mockQuery.calls[0].question}'`);
    assert(deepEqual(mockQuery.calls[0].opts, { k: 3 }), `Expected opts { k: 3 }, got ${JSON.stringify(mockQuery.calls[0].opts)}`);
  });

  await test("11. POST /api/query: query throw Error('rpc down') -> 500, response {error: 'rpc down'}", async () => {
    mockQuery.mockRejectedValue(new Error("rpc down"));
    const req = createRequest("http://localhost:3000/api/query", { question: "x" });
    const res = await queryPOST(req);
    assert(res.status === 500, `Expected status 500, got ${res.status}`);
    const data = await res.json();
    assert(deepEqual(data, { error: "rpc down" }), `Expected { error: "rpc down" }, got ${JSON.stringify(data)}`);
    assert(mockQuery.callCount === 1, `Expected query calls to be 1, got ${mockQuery.callCount}`);
  });

  console.log(`\n========================================`);
  console.log(`Total: ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log(`========================================`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
