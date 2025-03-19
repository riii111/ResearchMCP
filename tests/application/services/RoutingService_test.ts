/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { ok, Result } from "neverthrow";
import { RoutingService } from "../../../src/application/services/RoutingService.ts";
import { QueryParams, SearchError, SearchResponse } from "../../../src/domain/models/search.ts";
import { QueryCategory } from "../../../src/domain/models/routing.ts";
import { QueryClassifierPort } from "../../../src/application/ports/out/QueryClassifierPort.ts";
import { SearchRepository } from "../../../src/application/ports/out/SearchRepository.ts";

// Mock implementation of QueryClassifierPort
class MockQueryClassifier implements QueryClassifierPort {
  private readonly defaultCategory: QueryCategory;

  constructor(defaultCategory: QueryCategory = "general") {
    this.defaultCategory = defaultCategory;
  }

  classifyQuery(_query: string): Result<QueryCategory, Error> {
    return ok(this.defaultCategory);
  }
}

// Mock implementation of SearchRepository
class MockSearchRepository implements SearchRepository {
  private readonly id: string;
  private readonly name: string;
  private readonly supportedCategories: QueryCategory[];
  private readonly relevanceScore: number;
  private readonly mockResponse: Result<SearchResponse, SearchError>;

  constructor(
    id: string,
    name: string,
    supportedCategories: QueryCategory[],
    relevanceScore: number,
    mockResponse: Result<SearchResponse, SearchError>,
  ) {
    this.id = id;
    this.name = name;
    this.supportedCategories = supportedCategories;
    this.relevanceScore = relevanceScore;
    this.mockResponse = mockResponse;
  }

  search(_params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return Promise.resolve(this.mockResponse);
  }

  getRelevanceScore(_query: string, _category: QueryCategory): number {
    return this.relevanceScore;
  }

  getSupportedCategories(): ReadonlyArray<QueryCategory> {
    return this.supportedCategories;
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }
}

Deno.test("RoutingService should route to appropriate repository based on category", async () => {
  // Create mock repositories
  const generalRepo = new MockSearchRepository(
    "general-repo",
    "General Repository",
    ["general"],
    0.9,
    ok({
      query: { q: "test", maxResults: 10 },
      results: [{
        id: "1",
        title: "General Result",
        url: "https://example.com/general",
        snippet: "General snippet",
      }],
      totalResults: 1,
      searchTime: 100,
      source: "general-repo",
    }),
  );

  const techRepo = new MockSearchRepository(
    "tech-repo",
    "Tech Repository",
    ["technical", "programming"],
    0.8,
    ok({
      query: { q: "test", maxResults: 10 },
      results: [{
        id: "2",
        title: "Tech Result",
        url: "https://example.com/tech",
        snippet: "Tech snippet",
      }],
      totalResults: 1,
      searchTime: 100,
      source: "tech-repo",
    }),
  );

  // Create routing service with general classifier
  const routingService = new RoutingService(
    new MockQueryClassifier("general"),
    [generalRepo, techRepo],
  );

  // Test routing to general repository
  const result = await routingService.multiSearch({ q: "test", maxResults: 10 });
  assertEquals(result.isOk(), true);

  const response = result._unsafeUnwrap();
  assertEquals(response.results.length, 1);
  assertEquals(response.results[0].title, "General Result");
  assertEquals(response.source, "general-repo");
});

Deno.test("RoutingService should route to technical repository for technical queries", async () => {
  // Create mock repositories
  const generalRepo = new MockSearchRepository(
    "general-repo",
    "General Repository",
    ["general"],
    0.7,
    ok({
      query: { q: "test", maxResults: 10 },
      results: [{
        id: "1",
        title: "General Result",
        url: "https://example.com/general",
        snippet: "General snippet",
      }],
      totalResults: 1,
      searchTime: 100,
      source: "general-repo",
    }),
  );

  const techRepo = new MockSearchRepository(
    "tech-repo",
    "Tech Repository",
    ["technical", "programming"],
    0.9,
    ok({
      query: { q: "test", maxResults: 10 },
      results: [{
        id: "2",
        title: "Tech Result",
        url: "https://example.com/tech",
        snippet: "Tech snippet",
      }],
      totalResults: 1,
      searchTime: 100,
      source: "tech-repo",
    }),
  );

  // Create routing service with technical classifier
  const routingService = new RoutingService(
    new MockQueryClassifier("technical"),
    [generalRepo, techRepo],
  );

  // Test routing to technical repository
  const result = await routingService.multiSearch({ q: "test", maxResults: 10 });
  assertEquals(result.isOk(), true);

  const response = result._unsafeUnwrap();
  assertEquals(response.results.length, 1);
  assertEquals(response.results[0].title, "Tech Result");
  assertEquals(response.source, "tech-repo");
});

Deno.test("RoutingService should handle no available repositories", async () => {
  // Create routing service with no repositories
  const routingService = new RoutingService(
    new MockQueryClassifier("web3"),
    [],
  );

  // Test routing with no repositories
  const result = await routingService.multiSearch({ q: "test", maxResults: 10 });
  assertEquals(result.isErr(), true);

  const error = result._unsafeUnwrapErr();
  assertEquals(error.type, "no_adapter_available");
});

Deno.test("RoutingService should merge results from multiple repositories", async () => {
  // Create mock repositories
  const repo1 = new MockSearchRepository(
    "repo1",
    "Repository 1",
    ["general"],
    0.9,
    ok({
      query: { q: "test", maxResults: 10 },
      results: [{ id: "1", title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1" }],
      totalResults: 1,
      searchTime: 100,
      source: "repo1",
    }),
  );

  const repo2 = new MockSearchRepository(
    "repo2",
    "Repository 2",
    ["general"],
    0.8,
    ok({
      query: { q: "test", maxResults: 10 },
      results: [{ id: "2", title: "Result 2", url: "https://example.com/2", snippet: "Snippet 2" }],
      totalResults: 1,
      searchTime: 100,
      source: "repo2",
    }),
  );

  // Create routing service
  const routingService = new RoutingService(
    new MockQueryClassifier("general"),
    [repo1, repo2],
  );

  // Test multi-search
  const result = await routingService.multiSearch({ q: "test", maxResults: 10 });
  assertEquals(result.isOk(), true);

  const response = result._unsafeUnwrap();
  assertEquals(response.results.length, 2);
  assertEquals(response.totalResults, 2);
  assertEquals(response.source, "repo1,repo2");
});
