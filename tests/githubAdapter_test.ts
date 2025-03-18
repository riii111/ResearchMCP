/// <reference lib="deno.ns" />
import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { GitHubAdapter } from "../src/adapters/search/githubAdapter.ts";

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
  name: "GitHubAdapter - repository search",
  fn: async () => {
    const mockRepoResponse = {
      total_count: 2,
      incomplete_results: false,
      items: [
        {
          id: 12345,
          name: "test-repo",
          full_name: "test-user/test-repo",
          html_url: "https://github.com/test-user/test-repo",
          description: "A test repository",
          stargazers_count: 100,
          forks_count: 20,
          open_issues_count: 5,
          updated_at: "2023-01-15T10:00:00Z",
          language: "TypeScript",
          topics: ["test", "typescript"],
          owner: {
            login: "test-user",
            html_url: "https://github.com/test-user",
          },
        },
        {
          id: 67890,
          name: "another-repo",
          full_name: "test-org/another-repo",
          html_url: "https://github.com/test-org/another-repo",
          description: "Another test repository",
          stargazers_count: 500,
          forks_count: 150,
          open_issues_count: 20,
          updated_at: "2023-02-20T14:30:00Z",
          language: "JavaScript",
          topics: ["test", "javascript"],
          owner: {
            login: "test-org",
            html_url: "https://github.com/test-org",
          },
        },
      ],
    };

    setupMockFetch(mockRepoResponse);

    const adapter = new GitHubAdapter("mock-token");
    const result = await adapter.search({
      q: "typescript test",
      maxResults: 5,
    });

    assertEquals(result.isOk(), true);

    if (result.isOk()) {
      const response = result.value;

      assertEquals(response.source, "github");
      assertEquals(response.results.length, 2);
      assertEquals(response.totalResults, 2);

      const firstResult = response.results[0];
      assertEquals(firstResult.title, "test-user/test-repo");
      assertEquals(firstResult.url, "https://github.com/test-user/test-repo");
      assertEquals(firstResult.snippet, "A test repository");
      assertEquals(firstResult.sourceType, "repository");
      assertExists(firstResult.published);

      const secondResult = response.results[1];
      assertEquals(
        secondResult.relevanceScore !== undefined && firstResult.relevanceScore !== undefined &&
          secondResult.relevanceScore > firstResult.relevanceScore,
        true,
      );
    }

    restoreFetch();
  },
});

Deno.test({
  name: "GitHubAdapter - code search",
  fn: async () => {
    const mockCodeResponse = {
      total_count: 2,
      incomplete_results: false,
      items: [
        {
          name: "main.ts",
          path: "src/main.ts",
          sha: "abc123def456",
          url: "https://api.github.com/repositories/12345/contents/src/main.ts",
          git_url: "https://api.github.com/repositories/12345/git/blobs/abc123def456",
          html_url: "https://github.com/test-user/test-repo/blob/main/src/main.ts",
          repository: {
            id: 12345,
            name: "test-repo",
            full_name: "test-user/test-repo",
            html_url: "https://github.com/test-user/test-repo",
          },
          score: 0.85,
        },
        {
          name: "utils.ts",
          path: "src/utils/utils.ts",
          sha: "def456abc789",
          url: "https://api.github.com/repositories/67890/contents/src/utils/utils.ts",
          git_url: "https://api.github.com/repositories/67890/git/blobs/def456abc789",
          html_url: "https://github.com/test-org/another-repo/blob/main/src/utils/utils.ts",
          repository: {
            id: 67890,
            name: "another-repo",
            full_name: "test-org/another-repo",
            html_url: "https://github.com/test-org/another-repo",
          },
          score: 0.75,
        },
      ],
    };

    setupMockFetch(mockCodeResponse);

    const adapter = new GitHubAdapter("mock-token");
    const result = await adapter.search({
      q: "function example typescript",
      maxResults: 5,
    });

    assertEquals(result.isOk(), true);

    if (result.isOk()) {
      const response = result.value;

      assertEquals(response.source, "github");
      assertEquals(response.results.length, 2);
      assertEquals(response.totalResults, 2);

      const firstResult = response.results[0];
      assertEquals(firstResult.title, "test-user/test-repo: src/main.ts");
      assertEquals(
        firstResult.url,
        "https://github.com/test-user/test-repo/blob/main/src/main.ts",
      );
      assertEquals(firstResult.sourceType, "code");

      const secondResult = response.results[1];
      assertEquals(secondResult.title, "test-org/another-repo: src/utils/utils.ts");
      assertEquals(
        secondResult.relevanceScore !== undefined && firstResult.relevanceScore !== undefined &&
          secondResult.relevanceScore < firstResult.relevanceScore,
        true,
      );
    }

    restoreFetch();
  },
});

Deno.test({
  name: "GitHubAdapter - rate limit error handling",
  fn: async () => {
    const mockErrorHeaders = new Headers({
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": `${Math.floor(Date.now() / 1000) + 3600}`, // 1 hour from now
    });

    setupMockFetch({ message: "API rate limit exceeded" }, 403, mockErrorHeaders);

    const adapter = new GitHubAdapter("mock-token");
    const result = await adapter.search({
      q: "rate limit test",
      maxResults: 5,
    });

    assertEquals(result.isErr(), true);

    if (result.isErr()) {
      const error = result.error;
      assertEquals(error.type, "rateLimit");
      assertExists((error as { retryAfterMs: number }).retryAfterMs);
    }

    restoreFetch();
  },
});

Deno.test({
  name: "GitHubAdapter - search type detection",
  fn: async () => {
    // We'll verify the adapter correctly determines search type by checking the API URL
    let capturedUrl = "";

    // Mock implementation that captures the URL
    globalThis.fetch = ((url: RequestInfo | URL) => {
      capturedUrl = url.toString();

      // Return minimal valid response
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            total_count: 0,
            incomplete_results: false,
            items: [],
          }),
        headers: new Headers(),
      } as Response);
    }) as typeof fetch;

    const adapter = new GitHubAdapter("mock-token");

    // Try a repository search
    await adapter.search({ q: "typescript project", maxResults: 5 });
    assertEquals(capturedUrl.includes("/search/repositories"), true);

    // Try a code search
    await adapter.search({ q: "function typescript implementation", maxResults: 5 });
    assertEquals(capturedUrl.includes("/search/code"), true);

    restoreFetch();
  },
});

Deno.test({
  name: "GitHubAdapter - relevance scores",
  fn: () => {
    const adapter = new GitHubAdapter("mock-token");

    const programmingScore = adapter.getRelevanceScore("typescript function", "programming");
    const technicalScore = adapter.getRelevanceScore("system architecture", "technical");
    const generalScore = adapter.getRelevanceScore("what is github", "general");

    // GitHub should score highest for programming content
    assertEquals(programmingScore, 0.95);
    assertEquals(technicalScore, 0.8);
    assertEquals(generalScore, 0.7);

    // All scores should be between 0 and 1
    const scores = [programmingScore, technicalScore, generalScore];
    scores.forEach((score) => {
      assertEquals(score >= 0 && score <= 1, true);
    });
  },
});
