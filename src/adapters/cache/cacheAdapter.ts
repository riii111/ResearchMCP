import { Result } from "neverthrow";

export type CacheError = { type: "storage"; message: string };

/**
 * Interface for cache adapters that store and retrieve data
 */
export interface CacheAdapter {
  get<T>(key: string): Promise<Result<T | undefined, CacheError>>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<Result<void, CacheError>>;
}