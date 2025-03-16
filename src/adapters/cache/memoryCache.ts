import { err, ok, Result } from "neverthrow";
import { CacheAdapter, CacheError } from "./cacheAdapter.ts";

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

/**
 * In-memory implementation of the cache adapter
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private storage = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): Promise<Result<T | undefined, CacheError>> {
    try {
      const entry = this.storage.get(key);

      if (!entry) {
        return Promise.resolve(ok(undefined));
      }

      if (entry.expireAt < Date.now()) {
        this.storage.delete(key);
        return Promise.resolve(ok(undefined));
      }

      return Promise.resolve(ok(entry.value as T));
    } catch (error) {
      return Promise.resolve(err({
        type: "storage",
        message: error instanceof Error ? error.message : "Unknown error accessing storage",
      }));
    }
  }

  set<T>(key: string, value: T, ttlMs = 60 * 60 * 1000): Promise<Result<void, CacheError>> {
    try {
      this.storage.set(key, {
        value,
        expireAt: Date.now() + ttlMs,
      });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      return Promise.resolve(err({
        type: "storage",
        message: error instanceof Error ? error.message : "Unknown error writing to storage",
      }));
    }
  }

  clear(): void {
    this.storage.clear();
  }

  removeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.storage.entries()) {
      if (entry.expireAt < now) {
        this.storage.delete(key);
      }
    }
  }
}