import { Result, ok, err } from "neverthrow";
import { QueryParams, SearchResponse, SearchError, SearchResult } from "../models/search.ts";
import { SearchAdapter, CacheAdapter, createSearchCacheKey } from "./searchAdapter.ts";

interface BraveSearchParams {
  q: string;
  count: number;
  country?: string;
  search_lang?: string;
}

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  position?: number;
}

interface BraveSearchResponse {
  query: {
    original: string;
  };
  web: {
    results: BraveSearchResult[];
    total: number;
  };
  search_time_ms: number;
}

const BRAVE_API_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class BraveSearchAdapter implements SearchAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly cache?: CacheAdapter
  ) {}

  async search(query: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    if (this.cache) {
      const cacheKey = createSearchCacheKey(query);
      const cachedResult = await this.cache.get<SearchResponse>(cacheKey);
      
      if (cachedResult) {
        return ok(cachedResult);
      }
    }

    const params: BraveSearchParams = {
      q: query.q,
      count: query.maxResults,
    };

    if (query.country) params.country = query.country;
    if (query.language) params.search_lang = query.language;

    try {
      const response = await fetch(
        `${BRAVE_API_ENDPOINT}?${new URLSearchParams(params as Record<string, string>)}`,
        {
          headers: {
            "Accept": "application/json",
            "X-Subscription-Token": this.apiKey,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          return err({
            type: "rateLimit",
            retryAfterMs: retryAfter ? parseInt(retryAfter) * 1000 : 60000,
          });
        }

        if (response.status === 401 || response.status === 403) {
          return err({
            type: "authorization",
            message: `API Key authentication error: ${response.status}`,
          });
        }

        return err({
          type: "network",
          message: `API call error: ${response.status}`,
        });
      }

      const braveResponse = await response.json() as BraveSearchResponse;
      const searchResponse = this.mapBraveResponseToSearchResponse(braveResponse, query);

      if (this.cache) {
        const cacheKey = createSearchCacheKey(query);
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

  private mapBraveResponseToSearchResponse(
    braveResponse: BraveSearchResponse,
    query: QueryParams
  ): SearchResponse {
    const results: SearchResult[] = braveResponse.web.results.map((result, index) => ({
      id: Buffer.from(result.url).toString("base64"),
      title: result.title,
      url: result.url,
      snippet: result.description,
      published: result.age ? new Date(Date.now() - this.parseAge(result.age)) : undefined,
      rank: result.position || index + 1,
    }));

    return {
      query,
      results,
      totalResults: braveResponse.web.total,
      searchTime: braveResponse.search_time_ms,
    };
  }

  private parseAge(age: string): number {
    const match = age.match(/(\d+)\s*(minute|hour|day|week|month|year)s?/i);
    if (!match) return 0;

    const [_, value, unit] = match;
    const numValue = parseInt(value);

    const MS_PER_MINUTE = 60 * 1000;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;
    const MS_PER_WEEK = 7 * MS_PER_DAY;
    const MS_PER_MONTH = 30 * MS_PER_DAY;
    const MS_PER_YEAR = 365 * MS_PER_DAY;

    switch (unit.toLowerCase()) {
      case "minute": return numValue * MS_PER_MINUTE;
      case "hour": return numValue * MS_PER_HOUR;
      case "day": return numValue * MS_PER_DAY;
      case "week": return numValue * MS_PER_WEEK;
      case "month": return numValue * MS_PER_MONTH;
      case "year": return numValue * MS_PER_YEAR;
      default: return 0;
    }
  }
}