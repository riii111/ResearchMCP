import { Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse } from "../../models/search.ts";
import { QueryCategory } from "../../models/routing.ts";

/**
 * Interface for search adapters that connect to external search APIs
 */
export interface SearchAdapter {
  /** Unique identifier for this adapter */
  readonly id: string;

  /** Human-readable name for this adapter */
  readonly name: string;

  /** Categories of queries this adapter supports */
  readonly supportedCategories: ReadonlyArray<QueryCategory>;

  /** Performs a search using the specific search API */
  search(params: QueryParams): Promise<Result<SearchResponse, SearchError>>;

  /**
   * Calculates how relevant this adapter is for the given query and category
   * Returns a value between 0 (not relevant) and 1 (highly relevant)
   */
  getRelevanceScore(query: string, category: QueryCategory): number;
}

/**
 * Creates a cache key for search queries
 */
export function createSearchCacheKey(query: QueryParams, adapterId: string): string {
  const { q, maxResults, country, language } = query;
  return `search:${adapterId}:${q}:${maxResults}:${country || "any"}:${language || "any"}`;
}
