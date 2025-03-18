/// <reference lib="deno.ns" />
import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { SearchEntity } from "../../../src/domain/entities/SearchEntity.ts";
import { QueryParams, SearchResponse, SearchResult } from "../../../src/domain/models/search.ts";

Deno.test("SearchEntity should be created with correct initial values", () => {
  const query: QueryParams = { q: "test query", maxResults: 10 };
  const entity = new SearchEntity("test-id", query);

  assertEquals(entity.getId(), "test-id");
  assertEquals(entity.getQuery(), query);
  assertEquals(entity.getResults().length, 0);
  assertEquals(entity.getTotalResults(), 0);
  assertEquals(entity.getSearchTime(), 0);
  assertEquals(entity.getSource(), "");
});

Deno.test("SearchEntity should update results correctly", () => {
  const query: QueryParams = { q: "test query", maxResults: 10 };
  const entity = new SearchEntity("test-id", query);

  const results: SearchResult[] = [
    {
      id: "1",
      title: "Test Result",
      url: "https://example.com",
      snippet: "This is a test result",
      relevanceScore: 0.95,
    },
  ];

  const result = entity.updateResults(results, 1, 100, "test-source");
  assertEquals(result.isOk(), true);

  assertEquals(entity.getResults(), results);
  assertEquals(entity.getTotalResults(), 1);
  assertEquals(entity.getSearchTime(), 100);
  assertEquals(entity.getSource(), "test-source");
});

Deno.test("SearchEntity should convert to SearchResponse correctly", () => {
  const query: QueryParams = { q: "test query", maxResults: 10 };
  const entity = new SearchEntity("test-id", query);

  const results: SearchResult[] = [
    {
      id: "1",
      title: "Test Result",
      url: "https://example.com",
      snippet: "This is a test result",
    },
  ];

  entity.updateResults(results, 1, 100, "test-source");
  const response = entity.toSearchResponse();

  assertEquals(response.query, query);
  assertEquals(response.results, results);
  assertEquals(response.totalResults, 1);
  assertEquals(response.searchTime, 100);
  assertEquals(response.source, "test-source");
});

Deno.test("SearchEntity should be created from SearchResponse", () => {
  const query: QueryParams = { q: "test query", maxResults: 10 };
  const results: SearchResult[] = [
    {
      id: "1",
      title: "Test Result",
      url: "https://example.com",
      snippet: "This is a test result",
    },
  ];

  const response: SearchResponse = {
    query,
    results,
    totalResults: 1,
    searchTime: 100,
    source: "test-source",
  };

  const entity = SearchEntity.fromSearchResponse("test-id", response);

  assertEquals(entity.getId(), "test-id");
  assertEquals(entity.getQuery(), query);
  assertEquals(entity.getResults(), results);
  assertEquals(entity.getTotalResults(), 1);
  assertEquals(entity.getSearchTime(), 100);
  assertEquals(entity.getSource(), "test-source");
});

Deno.test("SearchEntity should filter results by relevance score", () => {
  const query: QueryParams = { q: "test query", maxResults: 10 };
  const entity = new SearchEntity("test-id", query);

  const results: SearchResult[] = [
    {
      id: "1",
      title: "High Relevance",
      url: "https://example.com/1",
      snippet: "High relevance result",
      relevanceScore: 0.95,
    },
    {
      id: "2",
      title: "Medium Relevance",
      url: "https://example.com/2",
      snippet: "Medium relevance result",
      relevanceScore: 0.75,
    },
    {
      id: "3",
      title: "Low Relevance",
      url: "https://example.com/3",
      snippet: "Low relevance result",
      relevanceScore: 0.55,
    },
  ];

  entity.updateResults(results, 3, 100, "test-source");

  // Filter with minimum score of 0.8
  const filteredEntity = entity.filterByRelevance(0.8);
  assertEquals(filteredEntity.getResults().length, 1);
  assertEquals(filteredEntity.getResults()[0].id, "1");

  // Filter with minimum score of 0.6
  const filteredEntity2 = entity.filterByRelevance(0.6);
  assertEquals(filteredEntity2.getResults().length, 2);
  assertEquals(filteredEntity2.getResults()[0].id, "1");
  assertEquals(filteredEntity2.getResults()[1].id, "2");
});
