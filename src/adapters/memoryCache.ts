import { CacheAdapter } from "./searchAdapter.ts";

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

export class MemoryCacheAdapter implements CacheAdapter {
  private storage = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): Promise<T | undefined> {
    const entry = this.storage.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return Promise.resolve(undefined);
    }

    if (entry.expireAt < Date.now()) {
      this.storage.delete(key);
      return Promise.resolve(undefined);
    }

    return Promise.resolve(entry.value);
  }

  set<T>(key: string, value: T, ttlMs = 60 * 60 * 1000): Promise<void> {
    this.storage.set(key, {
      value,
      expireAt: Date.now() + ttlMs,
    });
    return Promise.resolve();
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
