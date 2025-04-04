import { err, ok, Result, ResultAsync } from "neverthrow";
import {
  QueryParams,
  SearchError,
  SearchResponse,
  SearchResult,
} from "../../../domain/models/search.ts";
import { CacheAdapter } from "../cache/CacheAdapter.ts";
import { createSearchCacheKey, SearchAdapter } from "./SearchAdapter.ts";
import { QueryCategory } from "../../../domain/models/routing.ts";
import { searchAdapterRegistry } from "./Registry.ts";

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

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - Wikipedia content changes less frequently

export class WikipediaAdapter implements SearchAdapter {
  readonly id = "wikipedia";
  readonly name = "Wikipedia";
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
    const categoryScores: Record<QueryCategory, number> = {
      "academic": 0.9,
      "general": 0.7,
      "technical": 0.7,
      "programming": 0.5,
      "web3": 0.5,
      "qa": 0.4,
    };

    return categoryScores[category] ?? 0.4; // Default score 0.4
  }

  private executeSearch(params: QueryParams): ResultAsync<SearchResponse, SearchError> {
    const startTime = Date.now();

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

    const lang = params.language || this.language;
    const apiUrl = `https://${lang}.wikipedia.org/w/api.php?${urlParams.toString()}`;

    return this.fetchWikipediaData(apiUrl)
      .andThen((wikipediaResponse) => {
        const searchResponse = this.mapWikipediaResponseToSearchResponse(
          wikipediaResponse,
          params,
          startTime,
        );

        if (this.cache) {
          this.cacheSearchResults(params, searchResponse);
        }

        return ok(searchResponse);
      });
  }

  private fetchWikipediaData(
    apiUrl: string,
  ): ResultAsync<WikipediaSearchResponse, SearchError> {
    return ResultAsync.fromPromise(
      fetch(apiUrl),
      (e) => ({
        type: "network",
        message: e instanceof Error ? e.message : "Unknown error",
      } as SearchError),
    )
      .andThen((response) => {
        if (!response.ok) {
          return err<Response, SearchError>({
            type: "network",
            message: `Wikipedia API error: ${response.status} ${response.statusText}`,
          });
        }

        return ok(response);
      })
      .andThen((response) =>
        ResultAsync.fromPromise(
          response.json() as Promise<WikipediaSearchResponse>,
          () => ({
            type: "network",
            message: "Failed to parse API response",
          } as SearchError),
        )
      );
  }

  private mapWikipediaResponseToSearchResponse(
    wikipediaResponse: WikipediaSearchResponse,
    params: QueryParams,
    startTime: number,
  ): SearchResponse {
    const searchResults = wikipediaResponse.query.search;

    const results: SearchResult[] = searchResults.map((result, index) => {
      const cleanSnippet = result.snippet.replace(/<\/?[^>]+(>|$)/g, "");

      return {
        id: `wikipedia-${result.pageid}`,
        title: result.title,
        url: `https://${params.language || this.language}.wikipedia.org/wiki/${
          encodeURIComponent(result.title.replace(/ /g, "_"))
        }`,
        snippet: cleanSnippet,
        published: new Date(result.timestamp),
        rank: index + 1,
        source: this.name,
        sourceType: "encyclopedia",
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

export function registerWikipediaAdapter(
  cache?: CacheAdapter,
  language: string = "en",
): void {
  const adapter = new WikipediaAdapter(cache, language);
  searchAdapterRegistry.register(adapter);
}
