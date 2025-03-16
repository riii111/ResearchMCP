import { err, ok, Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../../models/search.ts";
import { CacheAdapter } from "../cache/cacheAdapter.ts";
import { createSearchCacheKey, SearchAdapter } from "./searchAdapter.ts";
import { getValueSafe } from "../../utils/resultUtils.ts";
import { QueryCategory } from "../../models/routing.ts";
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

/**
 * Adapter for the Tavily Search API
 */
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

      if (cacheResult.isOk()) {
        const cachedValue = getValueSafe(cacheResult);
        if (cachedValue) {
          return ok(cachedValue);
        }
      }
    }

    return await this.executeSearch(params);
  }

  getRelevanceScore(_query: string, category: QueryCategory): number {
    if (category === "general") {
      return 0.95;
    }

    if (category === "qa") {
      return 0.95;
    }

    if (category === "academic" || category === "technical") {
      return 0.85;
    }

    if (category === "programming") {
      return 0.8;
    }

    if (category === "web3") {
      return 0.7;
    }

    return 0.7;
  }

  /**
   * Execute a search using the Tavily API
   */
  private async executeSearch(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    const searchParams: TavilySearchParams = {
      api_key: this.apiKey,
      query: params.q,
      max_results: params.maxResults,
      search_depth: "advanced",
      include_answer: true,
    };

    try {
      const response = await fetch(TAVILY_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(searchParams),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return err({
            type: "rateLimit",
            retryAfterMs: 60000, // Default to 1 minute
          });
        }

        if (response.status === 401 || response.status === 403) {
          return err({
            type: "authorization",
            message: `Tavily API Key authentication error: ${response.status}`,
          });
        }

        let errorMessage = `API call error: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (_) {
          // Ignore JSON parsing errors
        }

        return err({
          type: "network",
          message: errorMessage,
        });
      }

      const tavilyResponse = await response.json() as TavilySearchResponse;
      const searchResponse = this.mapTavilyResponseToSearchResponse(tavilyResponse, params);

      if (this.cache) {
        const cacheKey = createSearchCacheKey(params, this.id);
        await this.cache.set(cacheKey, searchResponse, DEFAULT_CACHE_TTL_MS);
      }

      return ok(searchResponse);
    } catch (error) {
      return err({
        type: "network",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Map Tavily API response to standard search response format
   */
  private mapTavilyResponseToSearchResponse(
    tavilyResponse: TavilySearchResponse,
    params: QueryParams,
  ): SearchResponse {
    // Add the answer as a special result if available
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

    // Add the web search results
    const webResults = tavilyResponse.results.map((result, index) => ({
      id: btoa(result.url),
      title: result.title,
      url: result.url,
      snippet: result.content,
      published: result.published_date ? new Date(result.published_date) : undefined,
      rank: index + 1,
      source: this.name,
      sourceType: "web",
      relevanceScore: result.score,
    }));

    results.push(...webResults);

    return {
      query: params,
      results,
      totalResults: results.length,
      searchTime: 0, // API doesn't provide timing info
      source: this.id,
    };
  }
}

/**
 * Factory function to create and register a Tavily Search adapter
 */
export function registerTavilySearchAdapter(
  apiKey: string,
  cache?: CacheAdapter,
): void {
  const adapter = new TavilySearchAdapter(apiKey, cache);
  searchAdapterRegistry.register(adapter);
}
