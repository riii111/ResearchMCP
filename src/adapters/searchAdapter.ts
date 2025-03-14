import { Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse } from "../models/search.ts";

export interface SearchAdapter {
  search(query: QueryParams): Promise<Result<SearchResponse, SearchError>>;
}

export type CacheError = { type: "storage"; message: string };

export interface CacheAdapter {
  get<T>(key: string): Promise<Result<T | undefined, CacheError>>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<Result<void, CacheError>>;
}

export function createSearchCacheKey(query: QueryParams): string {
  const { q, maxResults, country, language } = query;
  return `search:${q}:${maxResults}:${country || "any"}:${language || "any"}`;
}
