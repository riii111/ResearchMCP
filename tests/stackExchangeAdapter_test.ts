/// <reference lib="deno.ns" />
import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { StackExchangeAdapter } from "../src/adapters/search/stackExchangeAdapter.ts";

const originalFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function setupMockFetch(responseData: unknown, status = 200, headers = new Headers()) {
  globalThis.fetch = () => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(responseData),
      headers,
      text: () => Promise.resolve(JSON.stringify(responseData)),
    } as Response);
  };
}

Deno.test({
  name: "StackExchangeAdapter - successful search",
  fn: async () => {
    const mockResponse = {
      items: [
        {
          question_id: 12345,
          title: "How to use TypeScript with React?",
          link: "https://stackoverflow.com/questions/12345/how-to-use-typescript-with-react",
          tags: ["javascript", "typescript", "reactjs"],
          owner: {
            account_id: 111,
            reputation: 5000,
            user_id: 222,
            user_type: "registered",
            profile_image: "https://www.gravatar.com/avatar/123",
            display_name: "Code Expert",
            link: "https://stackoverflow.com/users/222/code-expert",
          },
          is_answered: true,
          view_count: 10000,
          answer_count: 5,
          score: 50,
          creation_date: 1609459200, // 2021-01-01
          last_activity_date: 1640995200, // 2022-01-01
          accepted_answer_id: 67890,
        },
        {
          question_id: 67890,
          title: "TypeScript error with React useState",
          link: "https://stackoverflow.com/questions/67890/typescript-error-with-react-usestate",
          tags: ["javascript", "typescript", "reactjs", "hooks"],
          owner: {
            account_id: 333,
            reputation: 2000,
            user_id: 444,
            user_type: "registered",
            profile_image: "https://www.gravatar.com/avatar/456",
            display_name: "React Dev",
            link: "https://stackoverflow.com/users/444/react-dev",
          },
          is_answered: false,
          view_count: 5000,
          answer_count: 2,
          score: 20,
          creation_date: 1625097600, // 2021-07-01
          last_activity_date: 1656633600, // 2022-07-01
        },
      ],
      has_more: false,
      quota_max: 300,
      quota_remaining: 298,
    };

    setupMockFetch(mockResponse);

    try {
      const adapter = new StackExchangeAdapter(undefined, undefined, "stackoverflow");
      const result = await adapter.search({
        q: "typescript react",
        maxResults: 5,
      });

      assertEquals(result.isOk(), true);

      if (result.isOk()) {
        const response = result.value;

        assertEquals(response.source, "stackexchange");
        assertEquals(response.results.length, 2);
        assertEquals(response.totalResults, 2);

        const firstResult = response.results[0];
        assertEquals(firstResult.title, "How to use TypeScript with React?");
        assertEquals(
          firstResult.url,
          "https://stackoverflow.com/questions/12345/how-to-use-typescript-with-react",
        );
        assertExists(firstResult.relevanceScore);
        assertEquals(firstResult.sourceType, "qa");
        assertExists(firstResult.published);

        // Verify tags in snippet
        assertEquals(firstResult.snippet.includes("[javascript]"), true);
        assertEquals(firstResult.snippet.includes("[typescript]"), true);
        assertEquals(firstResult.snippet.includes("[reactjs]"), true);

        // Verify that the question with accepted answer has higher relevance
        const secondResult = response.results[1];
        assertEquals(
          firstResult.relevanceScore !== undefined &&
            secondResult.relevanceScore !== undefined &&
            firstResult.relevanceScore > secondResult.relevanceScore,
          true,
        );
      }
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: "StackExchangeAdapter - tag extraction",
  fn: async () => {
    let capturedUrl = "";

    // Mock the fetch function to capture the URL
    globalThis.fetch = ((url: RequestInfo | URL) => {
      capturedUrl = url.toString();

      // Return a minimal valid response
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [],
            has_more: false,
            quota_max: 300,
            quota_remaining: 300,
          }),
        headers: new Headers(),
      } as Response);
    }) as typeof fetch;

    try {
      const adapter = new StackExchangeAdapter();

      // Test query with recognized tags
      await adapter.search({ q: "how to use javascript in react project", maxResults: 5 });
      assertEquals(capturedUrl.includes("tagged=javascript%3Breact"), true);

      // Test query with no recognized tags
      await adapter.search({ q: "how to solve this problem", maxResults: 5 });
      assertEquals(capturedUrl.includes("tagged="), false);
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: "StackExchangeAdapter - error handling",
  fn: async () => {
    setupMockFetch({ error_id: 123, error_message: "Something went wrong" }, 400);

    try {
      const adapter = new StackExchangeAdapter();
      const result = await adapter.search({
        q: "invalid query",
        maxResults: 5,
      });

      assertEquals(result.isErr(), true);

      if (result.isErr()) {
        const error = result.error;
        assertEquals(error.type, "invalidQuery");
        assertExists((error as { issues: string[] }).issues);
      }
    } finally {
      restoreFetch();
    }
  },
});

Deno.test({
  name: "StackExchangeAdapter - relevance scores",
  fn: () => {
    const adapter = new StackExchangeAdapter();

    const qaScore = adapter.getRelevanceScore("how to do x", "qa");
    const programmingScore = adapter.getRelevanceScore("javascript function", "programming");
    const technicalScore = adapter.getRelevanceScore("system architecture", "technical");
    const generalScore = adapter.getRelevanceScore("what is stack overflow", "general");

    // Stack Exchange should score highest for Q&A content
    assertEquals(qaScore, 0.95);
    assertEquals(programmingScore, 0.9);
    assertEquals(technicalScore, 0.8);
    assertEquals(generalScore, 0.7);

    // All scores should be between 0 and 1
    const scores = [qaScore, programmingScore, technicalScore, generalScore];
    scores.forEach((score) => {
      assertEquals(score >= 0 && score <= 1, true);
    });
  },
});
