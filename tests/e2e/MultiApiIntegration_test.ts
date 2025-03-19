/// <reference lib="deno.ns" />
import { assert, assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { err, ok, Result } from "neverthrow";
import { SearchService } from "../../src/application/services/SearchService.ts";
import { RoutingService } from "../../src/application/services/RoutingService.ts";
import {
  QueryParams,
  SearchError,
  SearchResponse,
  SearchResult,
} from "../../src/domain/models/search.ts";
import { QueryCategory } from "../../src/domain/models/routing.ts";
import { QueryClassifierPort } from "../../src/application/ports/out/QueryClassifierPort.ts";
import { SearchRepository } from "../../src/application/ports/out/SearchRepository.ts";

// Helper function for creating mock responses
function createMockResponse(
  sourceId: string,
  query: string,
  results: Partial<SearchResult>[],
): SearchResponse {
  return {
    query: { q: query, maxResults: 10 },
    results: results.map((r, index) => ({
      id: `${sourceId}-${index}`,
      title: r.title || `${sourceId} result ${index}`,
      url: r.url || `https://example.com/${sourceId}/${index}`,
      snippet: r.snippet || `This is a snippet from ${sourceId}`,
      published: r.published || new Date(),
      rank: r.rank || index + 1,
      source: sourceId,
      sourceType: r.sourceType || "web",
      relevanceScore: r.relevanceScore || 1 - (index * 0.1),
    })),
    totalResults: results.length,
    searchTime: 100,
    source: sourceId,
  };
}

// Mock query classifier
class MockQueryClassifier implements QueryClassifierPort {
  private readonly defaultCategory: QueryCategory;

  constructor(defaultCategory: QueryCategory = "general") {
    this.defaultCategory = defaultCategory;
  }

  classifyQuery(query: string): Result<QueryCategory, Error> {
    // Simple keyword-based classification
    if (query.match(/\b(code|program|function|class|javascript|python|typescript)\b/i)) {
      return ok("programming" as QueryCategory);
    }
    if (query.match(/\b(blockchain|ethereum|bitcoin|nft|web3|crypto|token)\b/i)) {
      return ok("web3" as QueryCategory);
    }
    if (query.match(/\b(research|theory|study|academic|science|physics|biology)\b/i)) {
      return ok("academic" as QueryCategory);
    }
    if (query.match(/\b(how|what|why|when|where|who|explain|difference)\b/i)) {
      return ok("qa" as QueryCategory);
    }
    if (query.match(/\b(computer|network|system|architecture|protocol|technology)\b/i)) {
      return ok("technical" as QueryCategory);
    }

    // Return default category
    return ok(this.defaultCategory);
  }
}

// Mock search repository
class MockSearchRepository implements SearchRepository {
  private readonly id: string;
  private readonly name: string;
  private readonly supportedCategories: QueryCategory[];
  private readonly relevanceScores: Record<QueryCategory, number>;
  private readonly mockResponses: Record<string, Result<SearchResponse, SearchError>>;
  private readonly defaultResponse: Result<SearchResponse, SearchError>;

  constructor(
    id: string,
    name: string,
    supportedCategories: QueryCategory[],
    relevanceScores: Record<QueryCategory, number>,
    defaultResponse: Result<SearchResponse, SearchError>,
    mockResponses: Record<string, Result<SearchResponse, SearchError>> = {},
  ) {
    this.id = id;
    this.name = name;
    this.supportedCategories = supportedCategories;
    this.relevanceScores = relevanceScores;
    this.defaultResponse = defaultResponse;
    this.mockResponses = mockResponses;
  }

  search(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    // Return mock response based on query
    // Return special response if exists for the query
    if (this.mockResponses[params.q]) {
      return Promise.resolve(this.mockResponses[params.q]);
    }

    // Return default response
    return Promise.resolve(this.defaultResponse);
  }

  getRelevanceScore(_query: string, category: QueryCategory): number {
    return this.relevanceScores[category] || 0.5; // Default is 0.5
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

// Create mock responses for each adapter
function createBraveMockResponse(query: string): SearchResponse {
  return createMockResponse("brave", query, [
    {
      title: "Brave-specific result for " + query,
      snippet: "This is a result from Brave Search about " + query,
      sourceType: "web",
    },
    {
      title: "Another Brave result for " + query,
      snippet: "More information from Brave about " + query,
      sourceType: "web",
    },
  ]);
}

function createWikipediaMockResponse(query: string): SearchResponse {
  return createMockResponse("wikipedia", query, [
    {
      title: "Wikipedia article about " + query,
      snippet: "From Wikipedia, the free encyclopedia: " + query,
      sourceType: "encyclopedia",
    },
  ]);
}

function createTavilyMockResponse(query: string): SearchResponse {
  return createMockResponse("tavily", query, [
    {
      title: "AI Generated Answer",
      snippet: "Tavily AI answer about " + query,
      sourceType: "ai_answer",
      relevanceScore: 1.0,
    },
    {
      title: "Tavily web result for " + query,
      snippet: "Web search result from Tavily about " + query,
      sourceType: "web",
    },
  ]);
}

// E2E Test: Retrieving results from multiple APIs
Deno.test("E2E: Should retrieve results from multiple APIs", async () => {
  // Create mocks for each adapter
  const testQuery = "test query";

  const braveRepo = new MockSearchRepository(
    "brave",
    "Brave Search",
    ["general", "programming", "web3", "technical", "academic", "qa"],
    { general: 0.9, programming: 0.8, web3: 0.7, technical: 0.7, academic: 0.7, qa: 0.7 },
    ok(createBraveMockResponse(testQuery)),
  );

  const wikipediaRepo = new MockSearchRepository(
    "wikipedia",
    "Wikipedia",
    ["general", "academic", "technical"],
    { academic: 0.9, general: 0.8, technical: 0.75, programming: 0.5, web3: 0.5, qa: 0.4 },
    ok(createWikipediaMockResponse(testQuery)),
  );

  const tavilyRepo = new MockSearchRepository(
    "tavily",
    "Tavily Search",
    ["general", "programming", "academic", "technical", "qa"],
    { general: 0.95, qa: 0.95, academic: 0.85, technical: 0.85, programming: 0.8, web3: 0.7 },
    ok(createTavilyMockResponse(testQuery)),
  );

  // Routing service using all APIs
  const routingService = new RoutingService(
    new MockQueryClassifier("general"),
    [braveRepo, wikipediaRepo, tavilyRepo],
  );

  const service = new SearchService(routingService);
  const result = await service.searchMcp({ query: testQuery, options: { maxResults: 10 } });

  assertEquals(result.isOk(), true);
  const response = result._unsafeUnwrap();

  // Verify results from each API
  const sources = response.results.map((r) => r.source);
  assert(sources.includes("brave"), "Brave API results missing");
  assert(sources.includes("wikipedia"), "Wikipedia API results missing");
  assert(sources.includes("tavily"), "Tavily API results missing");

  // Check content characteristics
  assert(
    response.results.some((r) => r.title.includes("Brave-specific")),
    "Brave specific content missing",
  );
  assert(
    response.results.some((r) => r.title.includes("Wikipedia article")),
    "Wikipedia specific content missing",
  );
  assert(
    response.results.some((r) => r.title.includes("AI Generated Answer")),
    "Tavily AI answer missing",
  );
});

// E2E Test: Fallback to alternative APIs when one fails
Deno.test("E2E: Should fallback to alternative APIs when one fails", async () => {
  const testQuery = "test query";

  // Brave returns error
  const braveRepo = new MockSearchRepository(
    "brave",
    "Brave Search",
    ["general", "programming", "web3", "technical", "academic", "qa"],
    { general: 0.9, programming: 0.8, web3: 0.7, technical: 0.7, academic: 0.7, qa: 0.7 },
    err({ type: "network", message: "API unavailable" }),
  );

  // Wikipedia works normally
  const wikipediaRepo = new MockSearchRepository(
    "wikipedia",
    "Wikipedia",
    ["general", "academic", "technical"],
    { academic: 0.9, general: 0.8, technical: 0.75, programming: 0.5, web3: 0.5, qa: 0.4 },
    ok(createWikipediaMockResponse(testQuery)),
  );

  const routingService = new RoutingService(
    new MockQueryClassifier("general"),
    [braveRepo, wikipediaRepo],
  );

  const result = await routingService.multiSearch({ q: testQuery, maxResults: 10 });
  assertEquals(result.isOk(), true);

  // Should get Wikipedia results even when Brave fails
  const response = result._unsafeUnwrap();
  assertEquals(response.source, "wikipedia");
  assert(response.results[0].title.includes("Wikipedia article"), "Wikipedia content missing");
});

// Category Test: Programming
Deno.test("E2E: Should route programming queries to appropriate APIs", async () => {
  // Programming related queries
  const programmingQueries = [
    "How to implement a binary search tree in Python",
    "What are React hooks and how to use them",
    "Explain TypeScript generics with examples",
    "Best practices for error handling in Go",
  ];

  // Create adapter mocks
  const braveRepo = new MockSearchRepository(
    "brave",
    "Brave Search",
    ["general", "programming", "web3", "technical", "academic", "qa"],
    { programming: 0.9, general: 0.7, web3: 0.5, academic: 0.5, technical: 0.6, qa: 0.5 }, // High score for programming
    ok(createMockResponse("brave", "default", [{ title: "Brave programming result" }])),
  );

  const wikipediaRepo = new MockSearchRepository(
    "wikipedia",
    "Wikipedia",
    ["general", "academic", "technical"],
    { academic: 0.9, general: 0.8, technical: 0.75, programming: 0.5, web3: 0.5, qa: 0.4 },
    ok(createMockResponse("wikipedia", "default", [{ title: "Wikipedia programming article" }])),
  );

  const tavilyRepo = new MockSearchRepository(
    "tavily",
    "Tavily Search",
    ["general", "programming", "academic", "technical", "qa"],
    { programming: 0.85, general: 0.7, web3: 0.5, academic: 0.6, technical: 0.6, qa: 0.5 }, // High score for programming
    ok(createMockResponse("tavily", "default", [{ title: "Tavily programming result" }])),
  );

  // Test for each query
  for (const query of programmingQueries) {
    // Query classifier returns programming category
    const classifier = new MockQueryClassifier("programming");

    const routingService = new RoutingService(
      classifier,
      [braveRepo, wikipediaRepo, tavilyRepo],
    );

    const service = new SearchService(routingService);
    const result = await service.searchMcp({ query, options: { maxResults: 10 } });

    assertEquals(result.isOk(), true);
    const response = result._unsafeUnwrap();

    // Check if adapter with highest relevance score for programming category is selected
    const sources = response.results.map((r) => r.source);
    assert(
      sources.includes("brave") || sources.includes("tavily"),
      `No expected programming adapter used for query: ${query}`,
    );

    // First result should be from high-scoring adapter
    const firstSource = response.results[0].source;
    assert(
      firstSource === "brave" || firstSource === "tavily",
      `First result not from high-scoring adapter: ${firstSource}`,
    );
  }
});

// Category Test: Technical
Deno.test("E2E: Should route technical queries to appropriate APIs", async () => {
  // Technical related queries
  const technicalQueries = [
    "How do quantum computers work",
    "Explain TCP/IP protocol stack layers",
    "How does containerization work in Docker",
    "What is the architecture of neural networks",
  ];

  // Create adapter mocks
  const braveRepo = new MockSearchRepository(
    "brave",
    "Brave Search",
    ["general", "programming", "web3", "technical", "academic", "qa"],
    { technical: 0.8, general: 0.7, programming: 0.6, web3: 0.6, academic: 0.6, qa: 0.6 },
    ok(createMockResponse("brave", "default", [{ title: "Brave technical result" }])),
  );

  const wikipediaRepo = new MockSearchRepository(
    "wikipedia",
    "Wikipedia",
    ["general", "academic", "technical"],
    { technical: 0.85, academic: 0.8, general: 0.7, programming: 0.5, web3: 0.5, qa: 0.4 }, // High score for technical
    ok(createMockResponse("wikipedia", "default", [{ title: "Wikipedia technical article" }])),
  );

  // Test for each query
  for (const query of technicalQueries) {
    // Query classifier returns technical category
    const classifier = new MockQueryClassifier("technical");

    const routingService = new RoutingService(
      classifier,
      [braveRepo, wikipediaRepo],
    );

    const service = new SearchService(routingService);
    const result = await service.searchMcp({ query, options: { maxResults: 10 } });

    assertEquals(result.isOk(), true);
    const response = result._unsafeUnwrap();

    // Wikipedia has highest relevance for technical category
    const sources = response.results.map((r) => r.source);
    assert(
      sources.includes("wikipedia"),
      `Wikipedia results missing for technical query: ${query}`,
    );

    // First result should be from Wikipedia
    assertEquals(response.results[0].source, "wikipedia");
  }
});

// Category Test: Academic
Deno.test("E2E: Should prioritize academic sources for scholarly queries", async () => {
  // Academic related queries
  const academicQueries = [
    "What is the current research on dark matter",
    "Explain the theory of relativity and its implications",
    "Recent developments in CRISPR gene editing",
    "The impact of climate change on biodiversity",
  ];

  // Create adapter mocks
  const braveRepo = new MockSearchRepository(
    "brave",
    "Brave Search",
    ["general", "programming", "web3", "technical", "academic", "qa"],
    { academic: 0.7, general: 0.7, programming: 0.6, web3: 0.6, technical: 0.6, qa: 0.6 },
    ok(createMockResponse("brave", "default", [{ title: "Brave academic result" }])),
  );

  const wikipediaRepo = new MockSearchRepository(
    "wikipedia",
    "Wikipedia",
    ["general", "academic", "technical"],
    { academic: 0.95, general: 0.7, programming: 0.5, web3: 0.5, technical: 0.6, qa: 0.4 }, // Very high score for academic
    ok(createMockResponse("wikipedia", "default", [{ title: "Wikipedia academic article" }])),
  );

  // Test for each query
  for (const query of academicQueries) {
    // Query classifier returns academic category
    const classifier = new MockQueryClassifier("academic");

    const routingService = new RoutingService(
      classifier,
      [braveRepo, wikipediaRepo],
    );

    const service = new SearchService(routingService);
    const result = await service.searchMcp({ query });

    assertEquals(result.isOk(), true);
    const response = result._unsafeUnwrap();

    // Wikipedia has highest relevance for academic category
    const sources = response.results.map((r) => r.source);
    assert(sources.includes("wikipedia"), `Wikipedia results missing for academic query: ${query}`);

    // First result should be from Wikipedia
    assertEquals(response.results[0].source, "wikipedia");
  }
});

// Category Test: Web3
Deno.test("E2E: Should handle web3 and blockchain queries appropriately", async () => {
  // Web3 related queries
  const web3Queries = [
    "How does Ethereum smart contract work",
    "Explain blockchain consensus mechanisms",
    "What are NFTs and how do they work",
    "Solidity programming best practices",
  ];

  // Create adapter mocks
  const braveRepo = new MockSearchRepository(
    "brave",
    "Brave Search",
    ["general", "programming", "web3", "technical", "academic", "qa"],
    { web3: 0.9, general: 0.7, programming: 0.6, academic: 0.6, technical: 0.6, qa: 0.6 }, // High score for Web3
    ok(createMockResponse("brave", "default", [{ title: "Brave web3 result" }])),
  );

  const wikipediaRepo = new MockSearchRepository(
    "wikipedia",
    "Wikipedia",
    ["general", "academic", "technical"],
    { web3: 0.5, general: 0.7, programming: 0.5, academic: 0.8, technical: 0.7, qa: 0.4 },
    ok(createMockResponse("wikipedia", "default", [{ title: "Wikipedia web3 article" }])),
  );

  // Test for each query
  for (const query of web3Queries) {
    // Query classifier returns Web3 category
    const classifier = new MockQueryClassifier("web3");

    const routingService = new RoutingService(
      classifier,
      [braveRepo, wikipediaRepo],
    );

    const service = new SearchService(routingService);
    const result = await service.searchMcp({ query });

    assertEquals(result.isOk(), true);
    const response = result._unsafeUnwrap();

    // Brave has highest relevance for Web3 category
    const sources = response.results.map((r) => r.source);
    assert(sources.includes("brave"), `Brave results missing for web3 query: ${query}`);

    // First result should be from Brave
    assertEquals(response.results[0].source, "brave");
  }
});

// Category Test: QA
Deno.test("E2E: Should route QA-type queries effectively", async () => {
  // QA related queries
  const qaQueries = [
    "Why is the sky blue",
    "How tall is Mount Everest",
    "What causes earthquakes",
    "How many planets are in our solar system",
  ];

  // Create adapter mocks
  const braveRepo = new MockSearchRepository(
    "brave",
    "Brave Search",
    ["general", "programming", "web3", "technical", "academic", "qa"],
    { qa: 0.7, general: 0.7, programming: 0.6, web3: 0.6, academic: 0.6, technical: 0.6 },
    ok(createMockResponse("brave", "default", [{ title: "Brave qa result" }])),
  );

  const tavilyRepo = new MockSearchRepository(
    "tavily",
    "Tavily Search",
    ["general", "programming", "academic", "technical", "qa"],
    { qa: 0.95, general: 0.7, programming: 0.6, web3: 0.5, academic: 0.6, technical: 0.6 }, // Very high score for QA
    ok(createMockResponse("tavily", "default", [
      {
        title: "AI Generated Answer",
        snippet: "Tavily AI answer",
        sourceType: "ai_answer",
        relevanceScore: 1.0,
      },
    ])),
  );

  // Test for each query
  for (const query of qaQueries) {
    // Query classifier returns QA category
    const classifier = new MockQueryClassifier("qa");

    const routingService = new RoutingService(
      classifier,
      [braveRepo, tavilyRepo],
    );

    const service = new SearchService(routingService);
    const result = await service.searchMcp({ query });

    assertEquals(result.isOk(), true);
    const response = result._unsafeUnwrap();

    // Tavily has highest relevance for QA category
    const sources = response.results.map((r) => r.source);
    assert(sources.includes("tavily"), `Tavily results missing for qa query: ${query}`);

    // First result should be from Tavily
    assertEquals(response.results[0].source, "tavily");
    assertEquals(response.results[0].title, "AI Generated Answer");
  }
});

// Test for adapter priority verification
Deno.test("E2E: Should prioritize adapters correctly based on relevance scores", async () => {
  // Create three adapters with different high scores for different categories
  const adapter1 = new MockSearchRepository(
    "adapter1",
    "Adapter 1",
    ["general", "technical"],
    { technical: 0.9, general: 0.5, programming: 0.5, web3: 0.5, academic: 0.5, qa: 0.5 },
    ok(createMockResponse("adapter1", "default", [{ title: "Adapter1 result" }])),
  );

  const adapter2 = new MockSearchRepository(
    "adapter2",
    "Adapter 2",
    ["general", "technical"],
    { technical: 0.8, general: 0.7, programming: 0.5, web3: 0.5, academic: 0.5, qa: 0.5 },
    ok(createMockResponse("adapter2", "default", [{ title: "Adapter2 result" }])),
  );

  const adapter3 = new MockSearchRepository(
    "adapter3",
    "Adapter 3",
    ["general", "technical"],
    { technical: 0.7, general: 0.9, programming: 0.5, web3: 0.5, academic: 0.5, qa: 0.5 },
    ok(createMockResponse("adapter3", "default", [{ title: "Adapter3 result" }])),
  );

  // Test for technical query
  const technicalRoutingService = new RoutingService(
    new MockQueryClassifier("technical"),
    [adapter1, adapter2, adapter3],
  );

  const technicalResult = await technicalRoutingService.multiSearch({
    q: "technical query",
    maxResults: 10,
  });
  assertEquals(technicalResult.isOk(), true);
  const technicalResponse = technicalResult._unsafeUnwrap();

  // adapter1 should come first for technical query as it has highest relevance score
  assertEquals(technicalResponse.results[0].source, "adapter1");

  // Test for general query
  const generalRoutingService = new RoutingService(
    new MockQueryClassifier("general"),
    [adapter1, adapter2, adapter3],
  );

  const generalResult = await generalRoutingService.multiSearch({
    q: "general query",
    maxResults: 10,
  });
  assertEquals(generalResult.isOk(), true);
  const generalResponse = generalResult._unsafeUnwrap();

  // adapter3 should come first for general query as it has highest relevance score
  assertEquals(generalResponse.results[0].source, "adapter3");
});

// Test for query classification
Deno.test("E2E: Should correctly classify queries by category", () => {
  const queryTests = [
    { query: "How to write a React component", expected: "programming" },
    { query: "Latest research in quantum physics", expected: "academic" },
    { query: "How to buy Bitcoin", expected: "web3" },
    { query: "Why is the sky blue", expected: "qa" },
    { query: "How computers work", expected: "technical" },
  ];

  const classifier = new MockQueryClassifier();

  for (const test of queryTests) {
    const result = classifier.classifyQuery(test.query);
    assertEquals(result.isOk(), true);
    assertEquals(
      result._unsafeUnwrap(),
      test.expected,
      `Query "${test.query}" misclassified`,
    );
  }
});
