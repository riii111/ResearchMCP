export interface QueryParams {
  readonly q: string;
  readonly maxResults: number;
  readonly country?: string;
  readonly language?: string;
}

export interface SearchResult {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly published?: Date;
  readonly rank?: number;
}

export interface SearchResponse {
  readonly query: QueryParams;
  readonly results: ReadonlyArray<SearchResult>;
  readonly totalResults: number;
  readonly searchTime: number;
}

export type SearchError = 
  | { type: "network"; message: string }
  | { type: "rateLimit"; retryAfterMs: number }
  | { type: "invalidQuery"; issues: string[] }
  | { type: "authorization"; message: string };