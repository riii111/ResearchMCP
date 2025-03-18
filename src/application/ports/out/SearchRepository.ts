import { Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse } from "../../../domain/models/search.ts";
import { QueryCategory } from "../../../domain/models/routing.ts";

/**
 * Output port for search repository
 * Defines the interface for search operations that the application needs from external systems
 */
export interface SearchRepository {
  search(params: QueryParams): Promise<Result<SearchResponse, SearchError>>;

  getRelevanceScore(query: string, category: QueryCategory): number;

  getSupportedCategories(): ReadonlyArray<QueryCategory>;

  getId(): string;

  getName(): string;
}
