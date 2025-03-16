import { err, ok, Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../../models/search.ts";
import { CacheAdapter } from "../cache/cacheAdapter.ts";
import { createSearchCacheKey, SearchAdapter } from "./searchAdapter.ts";
import { getValueSafe } from "../../utils/resultUtils.ts";
import { QueryCategory } from "../../models/routing.ts";
import { searchAdapterRegistry } from "./registry.ts";

interface WikipediaSearchResult {
  pageid: number;
  ns: number;
  title: string;
  snippet: string;
  size: number;
  wordcount: number;
  timestamp: string;
}

interface WikipediaSearchResponse {
  batchcomplete: string;
  continue?: {
    sroffset: number;
    continue: string;
  };
  query: {
    searchinfo: {
      totalhits: number;
    };
    search: WikipediaSearchResult[];
  };
}

// API endpoint for Wikipedia search
// We build the endpoint dynamically based on language
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - Wikipedia content changes less frequently

/**
 * Adapter for the Wikipedia Search API
 */
export class WikipediaAdapter implements SearchAdapter {
  /** Unique identifier for this adapter */
  readonly id = "wikipedia";

  /** Human-readable name for this adapter */
  readonly name = "Wikipedia";

  /** Categories of queries this adapter supports */
  readonly supportedCategories: ReadonlyArray<QueryCategory> = [
    "general",
    "academic",
    "technical",
  ];

  constructor(
    private readonly cache?: CacheAdapter,
    private readonly language: string = "en",
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

  /**
   * Calculates how relevant this adapter is for the given query and category
   * @param query Search query text
   * @param category Query category
   * @returns Score from 0 to 1, with 1 being most relevant
   */
  getRelevanceScore(_query: string, category: QueryCategory): number {
    if (category === "academic") {
      return 0.9;
    }

    if (category === "general") {
      return 0.8;
    }

    if (category === "technical") {
      return 0.75;
    }

    if (category === "programming") {
      return 0.5;
    }

    if (category === "web3") {
      return 0.5;
    }

    if (category === "qa") {
      return 0.4;
    }

    return 0.4;
  }

  /**
   * Execute a search using the Wikipedia API
   */
  private async executeSearch(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    const startTime = Date.now();

    // Construct the query URL with search parameters
    const urlParams = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: params.q,
      format: "json",
      srlimit: params.maxResults.toString(),
      srinfo: "totalhits",
      srprop: "size|wordcount|timestamp|snippet",
      origin: "*", // Required for CORS
    });

    // Use user-specified language if available, otherwise use the adapter's default
    const lang = params.language || this.language;
    const apiUrl = `https://${lang}.wikipedia.org/w/api.php?${urlParams.toString()}`;

    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        return err({
          type: "network",
          message: `Wikipedia API error: ${response.status} ${response.statusText}`,
        });
      }

      const wikipediaResponse = await response.json() as WikipediaSearchResponse;
      const searchResponse = this.mapWikipediaResponseToSearchResponse(
        wikipediaResponse,
        params,
        startTime,
      );

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
   * Map Wikipedia API response to standard search response format
   */
  private mapWikipediaResponseToSearchResponse(
    wikipediaResponse: WikipediaSearchResponse,
    params: QueryParams,
    startTime: number,
  ): SearchResponse {
    const searchResults = wikipediaResponse.query.search;

    const results: SearchResult[] = searchResults.map((result, index) => {
      // Remove HTML tags from snippet
      const cleanSnippet = result.snippet.replace(/<\/?[^>]+(>|$)/g, "");

      return {
        id: `wikipedia-${result.pageid}`,
        title: result.title,
        // Create Wikipedia URL from title
        url: `https://${params.language || this.language}.wikipedia.org/wiki/${
          encodeURIComponent(result.title.replace(/ /g, "_"))
        }`,
        snippet: cleanSnippet,
        published: new Date(result.timestamp),
        rank: index + 1,
        source: this.name,
        sourceType: "encyclopedia",
        // Calculate relevance score based on position (1.0 to 0.1)
        relevanceScore: Math.max(0.1, 1 - (index * 0.1)),
      };
    });

    return {
      query: params,
      results,
      totalResults: wikipediaResponse.query.searchinfo.totalhits,
      searchTime: Date.now() - startTime,
      source: this.id,
    };
  }
}

/**
 * Factory function to create and register a Wikipedia adapter
 */
export function registerWikipediaAdapter(
  cache?: CacheAdapter,
  language: string = "en",
): void {
  const adapter = new WikipediaAdapter(cache, language);
  searchAdapterRegistry.register(adapter);
}
