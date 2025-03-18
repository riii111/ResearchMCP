import { RoutingOptions } from "./routing.ts";

/**
 * Parameters for search queries
 */
export interface QueryParams {
  readonly q: string;
  readonly maxResults: number;
  readonly country?: string;
  readonly language?: string;
  readonly routing?: RoutingOptions;
}

/**
 * Individual search result
 */
export interface SearchResult {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly published?: Date;
  readonly rank?: number;
  readonly source?: string;
  readonly sourceType?: string;
  readonly relevanceScore?: number;
}

/**
 * Combined search response
 */
export interface SearchResponse {
  readonly query: QueryParams;
  readonly results: ReadonlyArray<SearchResult>;
  readonly totalResults: number;
  readonly searchTime: number;
  readonly source: string;
}

/**
 * Combined search responses from multiple sources
 */
export interface MultiSearchResponse {
  readonly query: QueryParams;
  readonly results: ReadonlyArray<SearchResult>;
  readonly totalResults: number;
  readonly searchTime: number;
  readonly sources: ReadonlyArray<string>;
}

/**
 * Search error types
 */
export type SearchError =
  | { type: "network"; message: string }
  | { type: "rateLimit"; message: string; retryAfterMs: number }
  | { type: "invalidQuery"; message: string; issues: string[] }
  | { type: "authorization"; message: string }
  | { type: "classification_error"; message: string }
  | { type: "no_adapter_available"; message: string };
