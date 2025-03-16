/// <reference lib="deno.ns" />
import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { WikipediaAdapter } from "../src/adapters/search/wikipediaAdapter.ts";

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
  name: "WikipediaAdapter - successful search",
  fn: async () => {
    const mockResponse = {
      batchcomplete: "",
      query: {
        searchinfo: {
          totalhits: 2,
        },
        search: [
          {
            pageid: 12345,
            ns: 0,
            title: "Test Article",
            snippet: "This is a <span>test</span> article snippet",
            size: 1000,
            wordcount: 150,
            timestamp: "2023-01-15T10:00:00Z",
          },
          {
            pageid: 67890,
            ns: 0,
            title: "Another Test Page",
            snippet: "Another <span>test</span> page snippet",
            size: 2000,
            wordcount: 300,
            timestamp: "2023-02-20T14:30:00Z",
          },
        ],
      },
    };

    setupMockFetch(mockResponse);

    try {
      const adapter = new WikipediaAdapter();
      const result = await adapter.search({
        q: "test query",
        maxResults: 5,
      });

      assertEquals(result.isOk(), true);
      
      if (result.isOk()) {
        const response = result.value;
        
        assertEquals(response.source, "wikipedia");
        assertEquals(response.results.length, 2);
        assertEquals(response.totalResults, 2);
        
        const firstResult = response.results[0];
        assertEquals(firstResult.title, "Test Article");
        assertEquals(firstResult.url, "https://en.wikipedia.org/wiki/Test_Article");
        assertEquals(firstResult.snippet, "This is a test article snippet");
        assertEquals(firstResult.sourceType, "encyclopedia");
        assertExists(firstResult.published);
        
        // Check HTML tags were removed from snippet
        assertEquals(firstResult.snippet.includes("<span>"), false);
      }
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: "WikipediaAdapter - network error",
  fn: async () => {
    setupMockFetch({}, 500);

    try {
      const adapter = new WikipediaAdapter();
      const result = await adapter.search({
        q: "test query",
        maxResults: 5,
      });

      assertEquals(result.isErr(), true);
      
      if (result.isErr()) {
        const error = result.error;
        assertEquals(error.type, "network");
        assertEquals(error.message.includes("Wikipedia API error"), true);
      }
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: "WikipediaAdapter - language parameter",
  fn: async () => {
    // This test verifies the adapter uses the correct language parameter
    
    // We'll mock fetch and capture the URL that was used
    let capturedUrl = "";
    globalThis.fetch = (url: string | URL) => {
      capturedUrl = url.toString();
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          batchcomplete: "",
          query: {
            searchinfo: { totalhits: 0 },
            search: [],
          },
        }),
      } as Response);
    };

    try {
      // Test with default language (en)
      const defaultAdapter = new WikipediaAdapter();
      await defaultAdapter.search({ q: "test", maxResults: 5 });
      assertEquals(capturedUrl.includes("https://en.wikipedia.org"), true);
      
      // Test with custom language (ja)
      const japaneseAdapter = new WikipediaAdapter(undefined, "ja");
      await japaneseAdapter.search({ q: "テスト", maxResults: 5 });
      assertEquals(capturedUrl.includes("https://ja.wikipedia.org"), true);
      
      // Test with language override in query params
      await defaultAdapter.search({ 
        q: "test", 
        maxResults: 5,
        language: "fr" 
      });
      assertEquals(capturedUrl.includes("https://fr.wikipedia.org"), true);
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: "WikipediaAdapter - relevance scores",
  fn: () => {
    const adapter = new WikipediaAdapter();
    
    const academicScore = adapter.getRelevanceScore("research paper", "academic");
    const generalScore = adapter.getRelevanceScore("general information", "general");
    const technicalScore = adapter.getRelevanceScore("technical topic", "technical");
    const programmingScore = adapter.getRelevanceScore("javascript function", "programming");
    
    // Wikipedia should score highest for academic content
    assertEquals(academicScore, 0.9);
    assertEquals(generalScore, 0.8);
    assertEquals(technicalScore, 0.75);
    assertEquals(programmingScore, 0.5);
    
    // All scores should be between 0 and 1
    const scores = [academicScore, generalScore, technicalScore, programmingScore];
    scores.forEach(score => {
      assertEquals(score >= 0 && score <= 1, true);
    });
  },
});