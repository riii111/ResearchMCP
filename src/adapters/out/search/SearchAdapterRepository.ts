import { Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse } from "../../../domain/models/search.ts";
import { QueryCategory } from "../../../domain/models/routing.ts";
import { SearchRepository } from "../../../application/ports/out/SearchRepository.ts";
import { SearchAdapter } from "./SearchAdapter.ts";

/**
 * Adapter that converts SearchAdapter to SearchRepository
 */
export class SearchAdapterRepository implements SearchRepository {
  constructor(private readonly adapter: SearchAdapter) {}

  search(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return this.adapter.search(params);
  }

  getRelevanceScore(query: string, category: QueryCategory): number {
    return this.adapter.getRelevanceScore(query, category);
  }

  getSupportedCategories(): ReadonlyArray<QueryCategory> {
    return this.adapter.supportedCategories;
  }

  getId(): string {
    return this.adapter.id;
  }

  getName(): string {
    return this.adapter.name;
  }
}
