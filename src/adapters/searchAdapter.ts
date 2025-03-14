import { Result } from "neverthrow";
import { QueryParams, SearchResponse, SearchError } from "../models/search.ts";

export interface SearchAdapter {
  search(query: QueryParams): Promise<Result<SearchResponse, SearchError>>;
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
}

export function createSearchCacheKey(query: QueryParams): string {
  const { q, maxResults, country, language } = query;
  return `search:${q}:${maxResults}:${country || "any"}:${language || "any"}`;
}