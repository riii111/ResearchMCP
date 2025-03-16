/// <reference lib="deno.ns" />
import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { ok, Result } from "neverthrow";
import { Hono } from "hono";
import {
  ClaudeAdapter,
  ClaudeError,
  ClaudeRequest,
  ClaudeResponse,
} from "../src/adapters/claude/claudeAdapter.ts";
import { SearchService } from "../src/services/searchService.ts";
import { ResearchService } from "../src/services/researchService.ts";
import { createMcpRouter } from "../src/routes/mcp.ts";
import { createResearchRouter } from "../src/routes/research.ts";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../src/models/search.ts";
import { QueryCategory } from "../src/models/routing.ts";
import { McpResponse } from "../src/models/mcp.ts";

// MockRoutingService implements the minimum required interface for testing
class MockRoutingService {
  // Mock implementation of required properties and methods
  queryClassifier = {};

  constructor(private readonly mockResults: Result<SearchResponse, SearchError>) {}

  routeAndSearch(_params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResults);
  }

  multiSearch(_params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResults);
  }

  classifyQuery(_query: string): Result<QueryCategory, unknown> {
    return ok("general" as QueryCategory);
  }

  deduplicateResults(results: SearchResult[]): SearchResult[] {
    return results;
  }

  sortByRelevance(results: SearchResult[]): SearchResult[] {
    return results;
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
  const routingService = new MockRoutingService(mockSearchResults);
  const searchService = new SearchService(routingService);

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
  source: "mock-adapter",
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

  const res = await app.fetch(req);
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

  const res = await app.fetch(req);
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
