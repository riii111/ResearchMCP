import { err, ok, Result } from "neverthrow";
import {
  QueryParams,
  SearchError,
  SearchResponse,
  SearchResult,
} from "../../../domain/models/search.ts";
import { QueryCategory } from "../../../domain/models/routing.ts";
import { QueryClassifierPort } from "../../ports/out/QueryClassifierPort.ts";
import { SearchRepository } from "../../ports/out/SearchRepository.ts";

/**
 * Service for routing search queries to appropriate search repositories
 */
export class RoutingService {
  constructor(
    private readonly queryClassifier: QueryClassifierPort,
    private readonly searchRepositories: SearchRepository[],
  ) {}

  async routeAndSearch(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    // Determine search category (use provided or classify)
    const categoryResult = params.routing?.category
      ? ok(params.routing.category)
      : this.classifyQuery(params.q);

    if (categoryResult.isErr()) {
      // Convert error type to SearchError
      return err({
        type: "classification_error",
        message: categoryResult.error.message,
      });
    }

    const category = categoryResult.value;
    const repositories = this.getRepositoriesForCategory(category, params.q);

    if (repositories.length === 0) {
      return err({
        type: "no_adapter_available",
        message: `No repository available for category ${category}`,
      });
    }

    // Always use parallel search
    return this.multiSearch(params, category);
  }

  async multiSearch(
    params: QueryParams,
    category?: QueryCategory,
  ): Promise<Result<SearchResponse, SearchError>> {
    // Get the category if not provided
    const categoryResult = category ? ok(category) : this.classifyQuery(params.q);

    if (categoryResult.isErr()) {
      // Convert error type to SearchError
      return err({
        type: "classification_error",
        message: categoryResult.error.message,
      });
    }

    const resolvedCategory = categoryResult.value;

    // Get repositories for this category
    const repositories = this.getRepositoriesForCategory(resolvedCategory, params.q);
    if (repositories.length === 0) {
      return err({
        type: "no_adapter_available",
        message: `No repository available for category ${resolvedCategory}`,
      });
    }

    // Use all available repositories for parallel search
    const selectedRepositories = repositories;

    // Log search details
    const encoder = new TextEncoder();
    const logHeader = "[PARALLEL_SEARCH]";
    Deno.stderr.writeSync(
      encoder.encode(
        `${logHeader} Query category: ${resolvedCategory}, Query: "${params.q.substring(0, 50)}${
          params.q.length > 50 ? "..." : ""
        }"\n`,
      ),
    );
    Deno.stderr.writeSync(
      encoder.encode(
        `${logHeader} Available repositories: ${
          repositories.map((r) =>
            `${r.getId()} (${r.getName()}, score=${
              r.getRelevanceScore(params.q, resolvedCategory).toFixed(2)
            })`
          ).join(", ")
        }\n`,
      ),
    );
    Deno.stderr.writeSync(
      encoder.encode(
        `${logHeader} Selected repositories for parallel search: ${
          selectedRepositories.map((r) => `${r.getId()} (${r.getName()})`).join(", ")
        }\n`,
      ),
    );

    // Execute searches in parallel
    return this.executeParallelSearches(selectedRepositories, params);
  }

  private async executeParallelSearches(
    repositories: SearchRepository[],
    params: QueryParams,
  ): Promise<Result<SearchResponse, SearchError>> {
    const startTime = Date.now();
    const searchPromises = repositories.map((repository) => repository.search(params));
    const searchResults = await Promise.all(searchPromises);

    const successResults = searchResults.filter((result) => result.isOk());
    if (successResults.length === 0) {
      // If all searches failed, return the first error
      const firstError = searchResults[0];
      if (firstError.isErr()) {
        return firstError;
      }

      return err({
        type: "network",
        message: "All search repositories failed",
      });
    }

    return this.mergeSearchResults(successResults, params, startTime);
  }

  private mergeSearchResults(
    successResults: Result<SearchResponse, SearchError>[],
    params: QueryParams,
    startTime: number,
  ): Result<SearchResponse, SearchError> {
    const mergedResults: SearchResult[] = [];
    const sources: string[] = [];
    let totalResults = 0;

    for (const result of successResults) {
      if (result.isOk()) {
        const response = result.value;
        sources.push(response.source);
        totalResults += response.totalResults;

        const resultsWithSource = response.results.map((r) => ({
          ...r,
          source: response.source,
        }));

        mergedResults.push(...resultsWithSource);
      }
    }

    const uniqueResults = this.deduplicateResults(mergedResults);
    const sortedResults = this.sortByRelevance(uniqueResults);

    const encoder = new TextEncoder();
    const logHeader = "[PARALLEL_SEARCH_RESULTS]";
    Deno.stderr.writeSync(
      encoder.encode(
        `${logHeader} Total raw results: ${mergedResults.length}, Unique results after deduplication: ${uniqueResults.length}\n`,
      ),
    );
    Deno.stderr.writeSync(
      encoder.encode(
        `${logHeader} Results per source: ${
          sources.map((source, index) => {
            const count = successResults[index].isOk()
              ? successResults[index].value.results.length
              : 0;
            return `${source}: ${count}`;
          }).join(", ")
        }\n`,
      ),
    );
    Deno.stderr.writeSync(
      encoder.encode(
        `${logHeader} Total search time: ${Date.now() - startTime}ms\n`,
      ),
    );

    return ok({
      query: params,
      results: sortedResults,
      totalResults,
      searchTime: Date.now() - startTime,
      source: sources.join(","),
    });
  }

  private classifyQuery(query: string): Result<QueryCategory, SearchError> {
    return this.queryClassifier.classifyQuery(query)
      .mapErr((error) => ({
        type: "classification_error",
        message: error.message,
      }));
  }

  private getRepositoriesForCategory(category: QueryCategory, query: string): SearchRepository[] {
    // Filter repositories that support the category
    const supportingRepositories = this.searchRepositories.filter((repository) =>
      repository.getSupportedCategories().includes(category)
    );

    // Sort by relevance score
    return supportingRepositories.sort((a, b) => {
      const scoreA = a.getRelevanceScore(query, category);
      const scoreB = b.getRelevanceScore(query, category);
      return scoreB - scoreA; // Higher score first
    });
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const uniqueUrls = new Set<string>();
    return results.filter((result) => {
      if (uniqueUrls.has(result.url)) {
        return false;
      }
      uniqueUrls.add(result.url);
      return true;
    });
  }

  private sortByRelevance(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => {
      // If both have relevanceScore, use that
      if (a.relevanceScore !== undefined && b.relevanceScore !== undefined) {
        return b.relevanceScore - a.relevanceScore;
      }

      // Otherwise use rank
      const rankA = a.rank || 100;
      const rankB = b.rank || 100;
      return rankA - rankB;
    });
  }
}
