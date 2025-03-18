import { err, ok, Result, ResultAsync } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../../domain/models/search.ts";
import { CacheAdapter } from "../cache/cacheAdapter.ts";
import { createSearchCacheKey, SearchAdapter } from "./searchAdapter.ts";
import { QueryCategory } from "../../domain/models/routing.ts";
import { searchAdapterRegistry } from "./registry.ts";

interface TavilySearchParams {
  api_key: string;
  query: string;
  max_results: number;
  include_domains?: string[];
  exclude_domains?: string[];
  search_depth?: "basic" | "advanced";
  include_answer?: boolean;
  include_raw_content?: boolean;
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  score: number;
  published_date?: string;
}

interface TavilySearchResponse {
  results: TavilySearchResult[];
  answer?: string;
  query: string;
}

const TAVILY_API_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class TavilySearchAdapter implements SearchAdapter {
  readonly id = "tavily";
  readonly name = "Tavily Search";
  readonly supportedCategories: ReadonlyArray<QueryCategory> = [
    "general",
    "programming",
    "academic",
    "technical",
    "qa",
  ];

  constructor(
    private readonly apiKey: string,
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
    return this.executeSearch(params);
  }

  getRelevanceScore(_query: string, category: QueryCategory): number {
    const categoryScores: Record<Partial<QueryCategory>, number> = {
      "general": 0.95,
      "qa": 0.95,
      "academic": 0.85,
      "technical": 0.85,
      "programming": 0.8,
      "web3": 0.7,
    };

    return categoryScores[category] ?? 0.7;
  }

  private executeSearch(params: QueryParams): ResultAsync<SearchResponse, SearchError> {
    const searchParams: TavilySearchParams = {
      api_key: this.apiKey,
      query: params.q,
      max_results: params.maxResults,
      search_depth: "advanced",
      include_answer: true,
      include_raw_content: true,
    };

    return this.fetchTavilyData(searchParams, params)
      .andThen((tavilyResponse) => {
        const searchResponse = this.mapTavilyResponseToSearchResponse(
          tavilyResponse,
          params,
        );

        if (this.cache) {
          this.cacheSearchResults(params, searchResponse);
        }

        return ok(searchResponse);
      });
  }

  private fetchTavilyData(
    searchParams: TavilySearchParams,
    _params: QueryParams,
  ): ResultAsync<TavilySearchResponse, SearchError> {
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(searchParams),
    };

    return ResultAsync.fromPromise(
      fetch(TAVILY_API_ENDPOINT, fetchOptions),
      (e) => ({
        type: "network",
        message: e instanceof Error ? e.message : "Unknown error",
      } as SearchError),
    )
      .andThen((response) => {
        if (!response.ok) {
          if (response.status === 429) {
            return err<Response, SearchError>({
              type: "rateLimit",
              message: "Tavily API rate limit exceeded",
              retryAfterMs: 60000, // Default to 1 minute
            });
          }

          if (response.status === 401 || response.status === 403) {
            return err<Response, SearchError>({
              type: "authorization",
              message: `Tavily API Key authentication error: ${response.status}`,
            });
          }

          return this.handleApiError(response);
        }

        return ok(response);
      })
      .andThen((response) =>
        ResultAsync.fromPromise(
          response.json() as Promise<TavilySearchResponse>,
          () => ({
            type: "network",
            message: "Failed to parse API response",
          } as SearchError),
        )
      );
  }

  private handleApiError(response: Response): Result<Response, SearchError> {
    // Attempt to parse error JSON but don't error on parse failure
    ResultAsync.fromPromise(
      response.json(),
      () => ({ detail: "", message: "" }),
    )
      .match(
        (errorData) => {
          const errorMessage = errorData.detail || errorData.message ||
            `API call error: ${response.status}`;
          console.error(`API error: ${errorMessage}`);
        },
        () => {/* Ignore parse errors */},
      );

    // Return a standard error response regardless
    return err<Response, SearchError>({
      type: "network",
      message: `API call error: ${response.status}`,
    });
  }

  private mapTavilyResponseToSearchResponse(
    tavilyResponse: TavilySearchResponse,
    params: QueryParams,
  ): SearchResponse {
    const results: SearchResult[] = [];

    if (tavilyResponse.answer) {
      results.push({
        id: btoa(`tavily-answer-${Date.now()}`),
        title: "AI Generated Answer",
        url: "https://tavily.com/",
        snippet: tavilyResponse.answer,
        rank: 0,
        source: this.name,
        sourceType: "ai_answer",
        relevanceScore: 1.0,
      });
    }

    const webResults = tavilyResponse.results.map((result, index) => {
      let snippet = result.content;
      if (result.content.endsWith("...") && result.raw_content) {
        snippet = result.raw_content;
      }

      return {
        id: btoa(result.url),
        title: result.title,
        url: result.url,
        snippet,
        published: result.published_date ? new Date(result.published_date) : undefined,
        rank: index + 1,
        source: this.name,
        sourceType: "web",
        relevanceScore: result.score,
      };
    });

    results.push(...webResults);

    return {
      query: params,
      results,
      totalResults: results.length,
      searchTime: 0, // API doesn't provide timing info
      source: this.id,
    };
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

export function registerTavilySearchAdapter(
  apiKey: string,
  cache?: CacheAdapter,
): void {
  const adapter = new TavilySearchAdapter(apiKey, cache);
  searchAdapterRegistry.register(adapter);
}
