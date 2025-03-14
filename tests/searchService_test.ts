import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { ok, Result } from "neverthrow";
import { SearchAdapter } from "../src/adapters/searchAdapter.ts";
import { SearchService } from "../src/services/searchService.ts";
import { QueryParams, SearchError, SearchResponse } from "../src/models/search.ts";

class MockSearchAdapter implements SearchAdapter {
  constructor(private readonly mockResults: Result<SearchResponse, SearchError>) {}

  search(_query: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResults);
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
  };

  const mockAdapter = new MockSearchAdapter(ok(mockResponse));
  const service = new SearchService(mockAdapter);
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
  const service = new SearchService({} as SearchAdapter);

  const results = [
    { id: "1", title: "Test 1", url: "https://example.com/1", snippet: "Snippet 1", rank: 1 },
    { id: "2", title: "Test 2", url: "https://example.com/2", snippet: "Snippet 2", rank: 3 },
    { id: "3", title: "Test 3", url: "https://example.com/3", snippet: "Snippet 3", rank: 5 },
  ];

  const filtered = service.filterByRelevance(results, 3);
  assertEquals(filtered.length, 2);
  assertEquals(filtered[0].id, "2");
  assertEquals(filtered[1].id, "3");
});
