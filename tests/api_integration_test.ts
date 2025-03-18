/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { ok, Result } from "neverthrow";
import { Hono } from "hono";
import { SearchService } from "../src/services/searchService.ts";
import { createMcpRouter } from "../src/routes/mcp.ts";
import { QueryParams, SearchError, SearchResponse } from "../src/models/search.ts";
import { QueryCategory } from "../src/models/routing.ts";
import { McpResponse } from "../src/models/mcp.ts";
import { RoutingService } from "../src/services/routingService.ts";
import { QueryClassifierService } from "../src/services/queryClassifierService.ts";

class MockQueryClassifier extends QueryClassifierService {
  override classifyQuery(_query: string): Result<QueryCategory, Error> {
    return ok("general" as QueryCategory);
  }
}

class MockRoutingService extends RoutingService {
  private mockResults: Result<SearchResponse, SearchError>;

  constructor(results: Result<SearchResponse, SearchError>) {
    super(new MockQueryClassifier());
    this.mockResults = results;
  }

  override routeAndSearch(_params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResults);
  }

  override multiSearch(_params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResults);
  }
}

// Helper function to create a test app with mock adapters
function createTestApp(
  mockSearchResults: Result<SearchResponse, SearchError>,
): Hono {
  const app = new Hono();
  const routingService = new MockRoutingService(mockSearchResults);
  const searchService = new SearchService(routingService);

  app.route("/mcp", createMcpRouter(searchService));

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
