import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { ok, Result } from "neverthrow";
import { Hono } from "hono";
import { SearchAdapter } from "../src/adapters/searchAdapter.ts";
import {
  ClaudeAdapter,
  ClaudeError,
  ClaudeRequest,
  ClaudeResponse,
} from "../src/adapters/claudeAdapter.ts";
import { SearchService } from "../src/services/searchService.ts";
import { ResearchService } from "../src/services/researchService.ts";
import { createMcpRouter } from "../src/routes/mcp.ts";
import { createResearchRouter } from "../src/routes/research.ts";
import { QueryParams, SearchError, SearchResponse } from "../src/models/search.ts";
import { McpResponse } from "../src/models/mcp.ts";

class MockSearchAdapter implements SearchAdapter {
  constructor(private readonly mockResults: Result<SearchResponse, SearchError>) {}

  search(_query: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResults);
  }
}

class MockClaudeAdapter implements ClaudeAdapter {
  constructor(private readonly mockResponse: Result<ClaudeResponse, ClaudeError>) {}

  complete(_request: ClaudeRequest): Promise<Result<ClaudeResponse, ClaudeError>> {
    return Promise.resolve(this.mockResponse);
  }
}

// Mock API response types
type SuccessResponseType = { status: "success"; [key: string]: unknown };
type ErrorResponseType = { status: "error"; [key: string]: unknown };
type AnyResponseType = SuccessResponseType | ErrorResponseType;

// Helper function to create a test app with mock adapters
function createTestApp(
  mockSearchResults: Result<SearchResponse, SearchError>,
  mockClaudeResponse?: Result<ClaudeResponse, ClaudeError>,
): Hono {
  const app = new Hono();
  const searchAdapter = new MockSearchAdapter(mockSearchResults);
  const searchService = new SearchService(searchAdapter);

  app.route("/mcp", createMcpRouter(searchService));

  if (mockClaudeResponse) {
    const claudeAdapter = new MockClaudeAdapter(mockClaudeResponse);
    const researchService = new ResearchService(searchService, claudeAdapter);
    app.route("/research", createResearchRouter(researchService));
  }

  return app;
}

// Mock search results
const mockSearchResponse: SearchResponse = {
  query: { q: "test query", maxResults: 5 },
  results: [
    {
      id: "1",
      title: "Test Result 1",
      url: "https://example.com/1",
      snippet: "This is a test snippet for result 1",
      published: new Date(),
      rank: 1,
    },
    {
      id: "2",
      title: "Test Result 2",
      url: "https://example.com/2",
      snippet: "This is a test snippet for result 2",
      published: new Date(),
      rank: 2,
    },
  ],
  totalResults: 2,
  searchTime: 100,
};

// Mock Claude response
const mockClaudeResponse: ClaudeResponse = {
  id: "msg_123456789",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "text",
      text: JSON.stringify({
        summary: "This is a test summary",
        insights: ["Insight 1", "Insight 2"],
        sources: ["Source 1", "Source 2"],
      }),
    },
  ],
  model: "claude-3-sonnet-20240229",
  stop_reason: "end_turn",
  usage: {
    input_tokens: 100,
    output_tokens: 200,
  },
};

Deno.test("MCP search endpoint returns correct response", async () => {
  const app = createTestApp(ok(mockSearchResponse));

  const req = new Request("http://localhost/mcp/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "test query",
      options: {
        maxResults: 5,
      },
    }),
  });

  const res = await app.request(req);
  assertEquals(res.status, 200);

  const data = await res.json() as McpResponse;
  assertEquals(data.status, "success");
  assertEquals(data.results.length, 2);
  assertEquals(data.results[0].title, "Test Result 1");
  assertEquals(data.results[1].title, "Test Result 2");
});

Deno.test("Research endpoint returns enriched results", async () => {
  const app = createTestApp(ok(mockSearchResponse), ok(mockClaudeResponse));

  const req = new Request("http://localhost/research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "test query",
      options: {
        maxResults: 5,
      },
    }),
  });

  const res = await app.request(req);
  assertEquals(res.status, 200);

  const data = await res.json() as AnyResponseType;
  assertEquals(data.status, "success");

  if (data.status === "success" && "result" in data) {
    assertExists(data.result);
    const result = data.result as Record<string, unknown>;
    assertEquals(result.query, "test query");
    assertEquals(result.summary, "This is a test summary");
    assertEquals((result.insights as string[]).length, 2);
    assertEquals((result.sources as string[]).length, 2);
  }
});
