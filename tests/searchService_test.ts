/// <reference lib="deno.ns" />
import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { ok, Result } from "neverthrow";
import { SearchService } from "../src/services/searchService.ts";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../src/models/search.ts";
import { QueryCategory } from "../src/models/routing.ts";

// MockRoutingService implements the minimum required interface for testing
// Create a mock routing service that implements required RoutingService interface
class MockRoutingService {
  // Mock implementation of required properties and methods
  queryClassifier: any = {};

  constructor(private readonly mockResults: Result<SearchResponse, SearchError>) {}

  routeAndSearch(_params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResults);
  }

  multiSearch(_params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResults);
  }

  classifyQuery(_query: string): Result<any, any> {
    return ok("general");
  }

  deduplicateResults(results: any[]): any[] {
    return results;
  }

  sortByRelevance(results: any[]): any[] {
    return results;
  }
}

Deno.test("SearchService should transform search results to MCP format", async () => {
  const mockResponse: SearchResponse = {
    query: { q: "test", maxResults: 10 },
    results: [
      {
        id: "1",
        title: "Test Title",
        url: "https://example.com",
        snippet: "This is a test snippet",
        published: new Date(),
        rank: 1,
      },
    ],
    totalResults: 1,
    searchTime: 100,
    source: "mock",
  };

  const mockRoutingService = new MockRoutingService(ok(mockResponse));
  const service = new SearchService(mockRoutingService);
  const result = await service.searchMcp({ query: "test" });

  assertEquals(result.isOk(), true);
  const mcpResponse = result._unsafeUnwrap();
  assertEquals(mcpResponse.status, "success");
  assertEquals(mcpResponse.results.length, 1);
  assertExists(mcpResponse.results[0].published);
  assertEquals(mcpResponse.results[0].title, "Test Title");
  assertEquals(mcpResponse.results[0].url, "https://example.com");
  assertEquals(mcpResponse.results[0].snippet, "This is a test snippet");
});

Deno.test("SearchService should filter results by relevance", () => {
  // Create a mock routing service with empty search results
  const service = new SearchService(
    new MockRoutingService(ok({
      query: { q: "", maxResults: 0 },
      results: [],
      totalResults: 0,
      searchTime: 0,
      source: "mock",
    })),
  );

  const results = [
    { id: "1", title: "Test 1", url: "https://example.com/1", snippet: "Snippet 1", rank: 1 },
    { id: "2", title: "Test 2", url: "https://example.com/2", snippet: "Snippet 2", rank: 3 },
    { id: "3", title: "Test 3", url: "https://example.com/3", snippet: "Snippet 3", rank: 5 },
  ];

  // minScore is now compared against normalized rank (1 - rank/100)
  // For rank=1: score = 1 - (1/100) = 0.99
  // For rank=3: score = 1 - (3/100) = 0.97
  // For rank=5: score = 1 - (5/100) = 0.95
  // So with minScore=0.96, only rank 1 and 3 pass
  const filtered = service.filterByRelevance(results, 0.96);
  assertEquals(filtered.length, 2);
  assertEquals(filtered[0].id, "1");
  assertEquals(filtered[1].id, "2");
});
