import { Result } from "neverthrow";

/**
 * Output port for cache repository
 * Defines the interface for cache operations that the application needs
 */
export interface CacheRepository {
  get<T>(key: string): Promise<Result<T | undefined, CacheError>>;

  set<T>(key: string, value: T, ttlMs?: number): Promise<Result<void, CacheError>>;
}

/**
 * Cache error type
 */
export type CacheError = {
  type: "storage";
  message: string;
};
