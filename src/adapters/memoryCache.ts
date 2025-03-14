import { CacheAdapter } from "./searchAdapter.ts";

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

export class MemoryCacheAdapter implements CacheAdapter {
  private storage = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.storage.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return undefined;
    }

    if (entry.expireAt < Date.now()) {
      this.storage.delete(key);
      return undefined;
    }

    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs = 60 * 60 * 1000): Promise<void> {
    this.storage.set(key, {
      value,
      expireAt: Date.now() + ttlMs,
    });
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