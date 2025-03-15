import { err, ok, Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../models/search.ts";
import { CacheAdapter, createSearchCacheKey, SearchAdapter } from "./searchAdapter.ts";
import { getErrorSafe, getValueSafe } from "../utils/resultUtils.ts";

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
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;

export class BraveSearchAdapter implements SearchAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly cache?: CacheAdapter,
  ) {}

  async search(query: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    if (this.cache) {
      const cacheKey = createSearchCacheKey(query);
      const cacheResult = await this.cache.get<SearchResponse>(cacheKey);

      if (cacheResult.isOk()) {
        const cachedValue = getValueSafe(cacheResult);
        if (cachedValue) {
          return ok(cachedValue);
        }
      }
    }

    return this.executeWithBackoff(() => this.executeSearch(query));
  }

  private async executeSearch(query: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    const params: BraveSearchParams = {
      q: query.q,
      count: query.maxResults,
    };

    if (query.country) params.country = query.country;
    if (query.language) params.search_lang = query.language;

    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) urlParams.append(key, String(value));
    });

    try {
      const response = await fetch(
        `${BRAVE_API_ENDPOINT}?${urlParams}`,
        {
          headers: {
            "Accept": "application/json",
            "X-Subscription-Token": this.apiKey,
          },
        },
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
        // We ignore cache write errors as they're non-critical
      }

      return ok(searchResponse);
    } catch (error) {
      return err({
        type: "network",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async executeWithBackoff<T, E>(
    fn: () => Promise<Result<T, E>>,
    attempt = 1,
  ): Promise<Result<T, E>> {
    const result = await fn();

    if (result.isOk() || attempt >= MAX_RETRY_ATTEMPTS) {
      return result;
    }

    // Check if the error is a rate limit error that we can retry
    const error = getErrorSafe(result);
    if (error && typeof error === "object" && error !== null && "type" in error) {
      const typedError = error as { type: string; retryAfterMs?: number };

      if (typedError.type === "rateLimit") {
        // Use either the server-specified retry time or calculate backoff
        const retryAfter = typedError.retryAfterMs || this.calculateBackoff(attempt);
        console.log(
          `Rate limited. Retrying in ${retryAfter}ms (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`,
        );

        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        return this.executeWithBackoff(fn, attempt + 1);
      }
    }

    return result;
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialBackoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * exponentialBackoff;
    return exponentialBackoff + jitter;
  }

  private mapBraveResponseToSearchResponse(
    braveResponse: BraveSearchResponse,
    query: QueryParams,
  ): SearchResponse {
    const results: SearchResult[] = braveResponse.web.results.map((result, index) => ({
      id: btoa(result.url),
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
      case "minute":
        return numValue * MS_PER_MINUTE;
      case "hour":
        return numValue * MS_PER_HOUR;
      case "day":
        return numValue * MS_PER_DAY;
      case "week":
        return numValue * MS_PER_WEEK;
      case "month":
        return numValue * MS_PER_MONTH;
      case "year":
        return numValue * MS_PER_YEAR;
      default:
        return 0;
    }
  }
}
