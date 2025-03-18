import { err, ok, Result, ResultAsync } from "neverthrow";
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
        (cachedValue) => cachedValue ? ok(cachedValue) : this.fetchAndCacheResults(params),
        () => this.fetchAndCacheResults(params),
      );
    }

    return this.fetchAndCacheResults(params);
  }

  private fetchAndCacheResults(params: QueryParams): ResultAsync<SearchResponse, SearchError> {
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

    return "repositories";
  }

  private executeSearch(
    params: QueryParams,
    searchType: GitHubSearchType,
  ): ResultAsync<SearchResponse, SearchError> {
    const startTime = Date.now();

    return (searchType === "repositories"
      ? this.searchRepositories(params)
      : this.searchCode(params)).andThen(({ results, totalCount }) => {
        const searchResponse: SearchResponse = {
          query: params,
          results,
          totalResults: totalCount,
          searchTime: Date.now() - startTime,
          source: this.id,
        };

        if (this.cache) {
          this.cacheSearchResults(params, searchResponse);
        }

        return ok(searchResponse);
      });
  }

  private searchRepositories(
    params: QueryParams,
  ): ResultAsync<{ results: SearchResult[]; totalCount: number }, SearchError> {
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

    return this.fetchGitHubData(url.toString(), "repository search")
      .andThen((data) => {
        const repoData = data as GitHubRepoSearchResponse;

        const results: SearchResult[] = repoData.items.map((repo, index) => ({
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
          totalCount: repoData.total_count,
        });
      });
  }

  private searchCode(
    params: QueryParams,
  ): ResultAsync<{ results: SearchResult[]; totalCount: number }, SearchError> {
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

    return this.fetchGitHubData(url.toString(), "code search")
      .andThen((data) => {
        const codeData = data as GitHubCodeSearchResponse;

        const results: SearchResult[] = codeData.items.map((code, index) => ({
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
          totalCount: codeData.total_count,
        });
      });
  }

  private fetchGitHubData(
    url: string,
    searchContext: string,
  ): ResultAsync<GitHubRepoSearchResponse | GitHubCodeSearchResponse, SearchError> {
    return ResultAsync.fromPromise(
      fetch(url, {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `token ${this.token}`,
        },
      }),
      (e) => ({
        type: "network",
        message: e instanceof Error ? e.message : `Unknown error searching GitHub ${searchContext}`,
      } as SearchError),
    )
      .andThen((response) => {
        if (!response.ok) {
          if (response.status === 403) {
            return this.handleRateLimitError(response, searchContext);
          }

          if (response.status === 401) {
            return err<Response, SearchError>({
              type: "authorization",
              message: "Invalid GitHub API token",
            });
          }

          return err<Response, SearchError>({
            type: "network",
            message: `GitHub API error: ${response.status} ${response.statusText}`,
          });
        }

        return ok(response);
      })
      .andThen((response) =>
        ResultAsync.fromPromise(
          response.json(),
          (e) => ({
            type: "network",
            message: e instanceof Error
              ? `Failed to parse GitHub ${searchContext} response: ${e.message}`
              : `Failed to parse GitHub ${searchContext} response`,
          } as SearchError),
        )
      );
  }

  private handleRateLimitError(
    response: Response,
    searchContext: string,
  ): Result<Response, SearchError> {
    const rateLimit = response.headers.get("X-RateLimit-Remaining");
    const resetTime = response.headers.get("X-RateLimit-Reset");

    if (rateLimit === "0" && resetTime) {
      const resetTimeMs = parseInt(resetTime) * 1000;
      const retryAfterMs = resetTimeMs - Date.now();

      return err<Response, SearchError>({
        type: "rateLimit",
        message: `GitHub API rate limit exceeded for ${searchContext}`,
        retryAfterMs: Math.max(retryAfterMs, 60000), // at least 1 minute
      });
    }

    return err<Response, SearchError>({
      type: "authorization",
      message: "GitHub API authorization error or rate limit exceeded",
    });
  }

  private cacheSearchResults(
    params: QueryParams,
    searchResponse: SearchResponse,
  ): void {
    const cacheKey = createSearchCacheKey(params, this.id);
    this.cache!.set(cacheKey, searchResponse, DEFAULT_CACHE_TTL_MS)
      .then(() => {})
      .catch(() => {}); // Ignore cache errors
  }
}

export function registerGitHubAdapter(
  token: string,
  cache?: CacheAdapter,
): void {
  const adapter = new GitHubAdapter(token, cache);
  searchAdapterRegistry.register(adapter);
}
