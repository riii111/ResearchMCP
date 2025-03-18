import { err, Ok, ok, Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../../models/search.ts";
import { CacheAdapter } from "../cache/cacheAdapter.ts";
import { createSearchCacheKey, SearchAdapter } from "./searchAdapter.ts";
import { QueryCategory } from "../../models/routing.ts";
import { searchAdapterRegistry } from "./registry.ts";

interface GitHubSearchParams {
  q: string;
  per_page?: number;
  page?: number;
  sort?: "stars" | "forks" | "help-wanted-issues" | "updated";
  order?: "desc" | "asc";
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  updated_at: string;
  language: string | null;
  topics: string[];
  owner: {
    login: string;
    html_url: string;
  };
}

interface GitHubCode {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
  };
  score: number;
}

interface GitHubRepoSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepository[];
}

interface GitHubCodeSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubCode[];
}

type GitHubSearchType = "repositories" | "code";

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class GitHubAdapter implements SearchAdapter {
  readonly id = "github";
  readonly name = "GitHub";
  readonly supportedCategories: ReadonlyArray<QueryCategory> = [
    "programming",
    "technical",
  ];

  constructor(
    private readonly token: string,
    private readonly cache?: CacheAdapter,
  ) {}

  async search(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    if (this.cache) {
      const cacheKey = createSearchCacheKey(params, this.id);
      const cacheResult = await this.cache.get<SearchResponse>(cacheKey);
      
      return cacheResult.match(
        cachedValue => cachedValue ? ok(cachedValue) : this.fetchAndCacheResults(params),
        () => this.fetchAndCacheResults(params)
      );
    }

    return this.fetchAndCacheResults(params);
  }
  
  private fetchAndCacheResults(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    const searchType = this.determineSearchType(params.q);
    return this.executeSearch(params, searchType);
  }

  getRelevanceScore(_query: string, category: QueryCategory): number {
    const categoryScores: Record<Partial<QueryCategory>, number> = {
      "programming": 0.95,
      "technical": 0.8,
      "general": 0.7,
      "web3": 0.7,
      "academic": 0.7,
      "qa": 0.7,
    };

    return categoryScores[category] ?? 0.2;
  }

  private determineSearchType(query: string): GitHubSearchType {
    // If query contains code-specific terms, search for code
    const codeTerms = [
      "function",
      "class",
      "def ",
      "impl ",
      "type ",
      "interface",
      "struct",
      "enum",
      "code",
      "snippet",
      "implementation",
      "example",
      "syntax",
    ];

    if (codeTerms.some((term) => query.toLowerCase().includes(term))) {
      return "code";
    }

    // Default to repository search
    return "repositories";
  }

  private async executeSearch(
    params: QueryParams,
    searchType: GitHubSearchType,
  ): Promise<Result<SearchResponse, SearchError>> {
    const startTime = Date.now();

    try {
      let results: SearchResult[] = [];
      let totalCount = 0;

      if (searchType === "repositories") {
        const repoResult = await this.searchRepositories(params);
        if (repoResult.isErr()) {
          return err(repoResult.error);
        }

        const repoData =
          (repoResult as Ok<{ results: SearchResult[]; totalCount: number }, SearchError>)
            ._unsafeUnwrap();
        results = repoData.results;
        totalCount = repoData.totalCount;
      } else {
        const codeResult = await this.searchCode(params);
        if (codeResult.isErr()) {
          return err(codeResult.error);
        }

        const codeData =
          (codeResult as Ok<{ results: SearchResult[]; totalCount: number }, SearchError>)
            ._unsafeUnwrap();
        results = codeData.results;
        totalCount = codeData.totalCount;
      }

      const searchResponse: SearchResponse = {
        query: params,
        results,
        totalResults: totalCount,
        searchTime: Date.now() - startTime,
        source: this.id,
      };

      if (this.cache) {
        const cacheKey = createSearchCacheKey(params, this.id);
        await this.cache.set(cacheKey, searchResponse, DEFAULT_CACHE_TTL_MS);
      }

      return ok(searchResponse);
    } catch (error) {
      return err({
        type: "network",
        message: error instanceof Error ? error.message : "Unknown GitHub API error",
      });
    }
  }

  private async searchRepositories(
    params: QueryParams,
  ): Promise<Result<{ results: SearchResult[]; totalCount: number }, SearchError>> {
    const searchParams: GitHubSearchParams = {
      q: params.q,
      per_page: params.maxResults,
      sort: "stars",
      order: "desc",
    };

    const url = new URL("https://api.github.com/search/repositories");
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `token ${this.token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          const rateLimit = response.headers.get("X-RateLimit-Remaining");
          const resetTime = response.headers.get("X-RateLimit-Reset");

          if (rateLimit === "0" && resetTime) {
            const resetTimeMs = parseInt(resetTime) * 1000;
            const retryAfterMs = resetTimeMs - Date.now();

            return err({
              type: "rateLimit",
              retryAfterMs: Math.max(retryAfterMs, 60000), // at least 1 minute
            });
          }

          return err({
            type: "authorization",
            message: "GitHub API authorization error or rate limit exceeded",
          });
        }

        if (response.status === 401) {
          return err({
            type: "authorization",
            message: "Invalid GitHub API token",
          });
        }

        return err({
          type: "network",
          message: `GitHub API error: ${response.status} ${response.statusText}`,
        });
      }

      const data = await response.json() as GitHubRepoSearchResponse;

      const results: SearchResult[] = data.items.map((repo, index) => ({
        id: `github-repo-${repo.id}`,
        title: repo.full_name,
        url: repo.html_url,
        snippet: repo.description ||
          `${repo.full_name}: ${repo.stargazers_count} stars, ${repo.forks_count} forks`,
        published: new Date(repo.updated_at),
        rank: index + 1,
        source: this.name,
        sourceType: "repository",
        relevanceScore: Math.min(1, 0.5 + (repo.stargazers_count / 10000) * 0.5),
      }));

      return ok({
        results,
        totalCount: data.total_count,
      });
    } catch (error) {
      return err({
        type: "network",
        message: error instanceof Error
          ? error.message
          : "Unknown error searching GitHub repositories",
      });
    }
  }

  private async searchCode(
    params: QueryParams,
  ): Promise<Result<{ results: SearchResult[]; totalCount: number }, SearchError>> {
    // GitHub code search requires authenticated requests
    const searchParams: GitHubSearchParams = {
      q: params.q,
      per_page: params.maxResults,
    };

    const url = new URL("https://api.github.com/search/code");
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `token ${this.token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          const rateLimit = response.headers.get("X-RateLimit-Remaining");
          const resetTime = response.headers.get("X-RateLimit-Reset");

          if (rateLimit === "0" && resetTime) {
            const resetTimeMs = parseInt(resetTime) * 1000;
            const retryAfterMs = resetTimeMs - Date.now();

            return err({
              type: "rateLimit",
              retryAfterMs: Math.max(retryAfterMs, 60000), // at least 1 minute
            });
          }

          return err({
            type: "authorization",
            message: "GitHub API authorization error or rate limit exceeded",
          });
        }

        if (response.status === 401) {
          return err({
            type: "authorization",
            message: "Invalid GitHub API token",
          });
        }

        return err({
          type: "network",
          message: `GitHub API error: ${response.status} ${response.statusText}`,
        });
      }

      const data = await response.json() as GitHubCodeSearchResponse;

      const results: SearchResult[] = data.items.map((code, index) => ({
        id: `github-code-${code.sha}`,
        title: `${code.repository.full_name}: ${code.path}`,
        url: code.html_url,
        snippet: `Code file: ${code.path} in repository ${code.repository.full_name}`,
        rank: index + 1,
        source: this.name,
        sourceType: "code",
        relevanceScore: Math.min(1, 0.3 + code.score * 0.7),
      }));

      return ok({
        results,
        totalCount: data.total_count,
      });
    } catch (error) {
      return err({
        type: "network",
        message: error instanceof Error ? error.message : "Unknown error searching GitHub code",
      });
    }
  }
}

export function registerGitHubAdapter(
  token: string,
  cache?: CacheAdapter,
): void {
  const adapter = new GitHubAdapter(token, cache);
  searchAdapterRegistry.register(adapter);
}
