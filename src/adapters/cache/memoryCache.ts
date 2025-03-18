import { ok, Result } from "neverthrow";
import { CacheAdapter, CacheError } from "./cacheAdapter.ts";

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

export class MemoryCacheAdapter implements CacheAdapter {
  private storage = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): Promise<Result<T | undefined, CacheError>> {
    const entry = this.storage.get(key);

    if (!entry) {
      return Promise.resolve(ok(undefined));
    }

    if (entry.expireAt < Date.now()) {
      this.storage.delete(key);
      return Promise.resolve(ok(undefined));
    }

    return Promise.resolve(ok(entry.value as T));
  }

  set<T>(key: string, value: T, ttlMs = 60 * 60 * 1000): Promise<Result<void, CacheError>> {
    this.storage.set(key, {
      value,
      expireAt: Date.now() + ttlMs,
    });
    
    return Promise.resolve(ok(undefined));
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
