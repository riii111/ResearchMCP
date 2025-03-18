import { Result } from "neverthrow";
import {
  CacheError as RepoCacheError,
  CacheRepository,
} from "../../../application/ports/out/CacheRepository.ts";
import { CacheAdapter, CacheError as AdapterCacheError } from "../../cache/cacheAdapter.ts";

/**
 * Adapter that converts CacheAdapter to CacheRepository
 */
export class CacheAdapterRepository implements CacheRepository {
  constructor(private readonly adapter: CacheAdapter) {}

  async get<T>(key: string): Promise<Result<T | undefined, RepoCacheError>> {
    const result = await this.adapter.get<T>(key);
    return result.mapErr(this.convertError);
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<Result<void, RepoCacheError>> {
    const result = await this.adapter.set<T>(key, value, ttlMs);
    return result.mapErr(this.convertError);
  }

  private convertError(error: AdapterCacheError): RepoCacheError {
    return {
      type: error.type,
      message: error.message,
    };
  }
}
