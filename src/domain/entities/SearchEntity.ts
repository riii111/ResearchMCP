import { err, ok, Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../models/search.ts";

/**
 * SearchEntity represents a search operation with its parameters and results
 */
export class SearchEntity {
  private readonly id: string;
  private readonly query: QueryParams;
  private results: ReadonlyArray<SearchResult>;
  private totalResults: number;
  private searchTime: number;
  private source: string;

  constructor(id: string, query: QueryParams) {
    this.id = id;
    this.query = query;
    this.results = [];
    this.totalResults = 0;
    this.searchTime = 0;
    this.source = "";
  }

  getId(): string {
    return this.id;
  }

  getQuery(): QueryParams {
    return this.query;
  }

  getResults(): ReadonlyArray<SearchResult> {
    return this.results;
  }

  getTotalResults(): number {
    return this.totalResults;
  }

  getSearchTime(): number {
    return this.searchTime;
  }

  getSource(): string {
    return this.source;
  }

  updateResults(
    results: ReadonlyArray<SearchResult>,
    totalResults: number,
    searchTime: number,
    source: string,
  ): Result<SearchEntity, SearchError> {
    if (!Array.isArray(results)) {
      return err({
        type: "invalidQuery",
        message: "Invalid search results format",
        issues: ["Results must be an array"],
      });
    }

    this.results = results;
    this.totalResults = totalResults;
    this.searchTime = searchTime;
    this.source = source;

    return ok(this);
  }

  toSearchResponse(): SearchResponse {
    return {
      query: this.query,
      results: this.results,
      totalResults: this.totalResults,
      searchTime: this.searchTime,
      source: this.source,
    };
  }

  static fromSearchResponse(id: string, response: SearchResponse): SearchEntity {
    const entity = new SearchEntity(id, response.query);
    entity.updateResults(
      response.results,
      response.totalResults,
      response.searchTime,
      response.source,
    );
    return entity;
  }

  filterByRelevance(minScore: number): SearchEntity {
    const filteredResults = this.results.filter(
      (result) => (result.relevanceScore ?? 0) >= minScore,
    );

    const entity = new SearchEntity(this.id, this.query);
    entity.updateResults(
      filteredResults,
      filteredResults.length,
      this.searchTime,
      this.source,
    );

    return entity;
  }
}
