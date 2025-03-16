/// <reference lib="deno.ns" />
import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { TavilySearchAdapter } from "../src/adapters/search/tavilySearchAdapter.ts";

const originalFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function setupMockFetch(responseData: unknown, status = 200) {
  globalThis.fetch = () => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(responseData),
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify(responseData)),
    } as Response);
  };
}

Deno.test({
  name: "TavilySearchAdapter - successful search",
  fn: async () => {
    const mockResponse = {
      results: [
        {
          title: "Test Article",
          url: "https://example.com/article",
          content: "This is a test article content",
          score: 0.95,
          published_date: "2023-01-15T10:00:00Z",
        },
      ],
      answer: "This is an AI generated answer for the query.",
      query: "test query",
    };

    setupMockFetch(mockResponse);

    try {
      const adapter = new TavilySearchAdapter("test-api-key");
      const result = await adapter.search({
        q: "test query",
        maxResults: 5,
      });

      assertEquals(result.isOk(), true);
      
      if (result.isOk()) {
        const response = result.value;
        
        assertEquals(response.source, "tavily");
        assertEquals(response.results.length, 2); // Answer + 1 result
        assertEquals(response.totalResults, 2);
        
        const answerResult = response.results[0];
        assertEquals(answerResult.title, "AI Generated Answer");
        assertEquals(answerResult.sourceType, "ai_answer");
        assertEquals(answerResult.relevanceScore, 1.0);
        
        const webResult = response.results[1];
        assertEquals(webResult.title, "Test Article");
        assertEquals(webResult.url, "https://example.com/article");
        assertEquals(webResult.snippet, "This is a test article content");
        assertEquals(webResult.sourceType, "web");
        assertExists(webResult.published);
      }
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: "TavilySearchAdapter - authorization error",
  fn: async () => {
    setupMockFetch({ message: "Invalid API key" }, 401);

    try {
      const adapter = new TavilySearchAdapter("invalid-api-key");
      const result = await adapter.search({
        q: "test query",
        maxResults: 5,
      });

      assertEquals(result.isErr(), true);
      
      if (result.isErr()) {
        const error = result.error;
        assertEquals(error.type, "authorization");
        assertEquals((error as { type: string; message: string }).message.includes("API Key authentication error"), true);
      }
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: "TavilySearchAdapter - relevance scores",
  fn: () => {
    const adapter = new TavilySearchAdapter("test-api-key");
    
    const generalScore = adapter.getRelevanceScore("general query", "general");
    const qaScore = adapter.getRelevanceScore("how to code", "qa");
    const academicScore = adapter.getRelevanceScore("research paper", "academic");
    const web3Score = adapter.getRelevanceScore("blockchain", "web3");
    
    assertEquals(generalScore, 0.95);
    assertEquals(qaScore, 0.95);
    assertEquals(academicScore, 0.85);
    assertEquals(web3Score, 0.7);
    
    const validScoreRange = (score: number) => score >= 0 && score <= 1;
    assertEquals(validScoreRange(generalScore), true);
    assertEquals(validScoreRange(qaScore), true);
    assertEquals(validScoreRange(academicScore), true);
    assertEquals(validScoreRange(web3Score), true);
  },
});