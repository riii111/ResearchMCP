import { Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse } from "../../models/search.ts";
import { QueryCategory } from "../../models/routing.ts";

/**
 * Interface for search adapters that connect to external search APIs
 */
export interface SearchAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportedCategories: ReadonlyArray<QueryCategory>;
  search(params: QueryParams): Promise<Result<SearchResponse, SearchError>>;

  // Returns relevance score between 0-1
  getRelevanceScore(query: string, category: QueryCategory): number;
}

// Generate a unique cache key for search queries
export function createSearchCacheKey(query: QueryParams, adapterId: string): string {
  const { q, maxResults, country, language } = query;
  return `search:${adapterId}:${q}:${maxResults}:${country || "any"}:${language || "any"}`;
}
