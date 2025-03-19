import { ok, Result, ResultAsync } from "neverthrow";
import {
  QueryParams,
  SearchError,
  SearchResponse,
  SearchResult,
} from "../../domain/models/search.ts";
import { QueryCategory } from "../../domain/models/routing.ts";
import { QueryClassifierPort } from "../ports/out/QueryClassifierPort.ts";
import { SearchRepository } from "../ports/out/SearchRepository.ts";

/**
 * Service for routing search queries to appropriate search repositories
 */
export class RoutingService {
  constructor(
    private readonly queryClassifier: QueryClassifierPort,
    private readonly searchRepositories: SearchRepository[],
  ) {}

  routeAndSearch(params: QueryParams): ResultAsync<SearchResponse, SearchError> {
    // Determine search category (use provided or classify)
    const categoryResult = params.routing?.category
      ? ok(params.routing.category)
      : this.classifyQuery(params.q);

    if (categoryResult.isErr()) {
      return ResultAsync.fromPromise(
        Promise.reject({
          type: "classification_error",
          message: categoryResult.error.message,
        }),
        (e) => e as SearchError,
      );
    }

    const category = categoryResult.value;
    const repositories = this.getRepositoriesForCategory(category, params.q);

    if (repositories.length === 0) {
      return ResultAsync.fromPromise(
        Promise.reject({
          type: "no_adapter_available",
          message: `No repository available for category ${category}`,
        }),
        (e) => e as SearchError,
      );
    }

    // Always use parallel search
    return this.multiSearch(params, category);
  }

  multiSearch(
    params: QueryParams,
    category?: QueryCategory,
  ): ResultAsync<SearchResponse, SearchError> {
    const categoryResult = category ? ok(category) : this.classifyQuery(params.q);

    if (categoryResult.isErr()) {
      return ResultAsync.fromPromise(
        Promise.reject({
          type: "classification_error",
          message: categoryResult.error.message,
        }),
        (e) => e as SearchError,
      );
    }

    const resolvedCategory = categoryResult.value;

    const repositories = this.getRepositoriesForCategory(resolvedCategory, params.q);
    if (repositories.length === 0) {
      return ResultAsync.fromPromise(
        Promise.reject({
          type: "no_adapter_available",
          message: `No repository available for category ${resolvedCategory}`,
        }),
        (e) => e as SearchError,
      );
    }

    const selectedRepositories = repositories;

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

    return ResultAsync.fromPromise(
      this.executeParallelSearches(selectedRepositories, params),
      (e) => e as SearchError,
    );
  }

  private async executeParallelSearches(
    repositories: SearchRepository[],
    params: QueryParams,
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const encoder = new TextEncoder();

    // Execute all search promises
    const searchPromises = repositories.map((repository) => repository.search(params));
    const searchResults = await Promise.all(searchPromises);

    // Log errors but continue if at least one search succeeded
    const successResults = searchResults.filter((result) => result.isOk());
    const failedResults = searchResults.filter((result) => result.isErr());

    for (let i = 0; i < failedResults.length; i++) {
      const result = failedResults[i];
      if (result.isErr()) {
        const error = result.error;
        const repoIndex = searchResults.indexOf(result);
        const repoName = repoIndex >= 0 && repoIndex < repositories.length
          ? repositories[repoIndex].getName()
          : "Unknown";

        Deno.stderr.writeSync(
          encoder.encode(
            `[SEARCH_ERROR] Repository ${repoName} failed: ${error.type} - ${error.message}\n`,
          ),
        );
      }
    }

    if (successResults.length === 0) {
      // If all searches failed, return the first error
      const firstError = searchResults[0];
      if (firstError.isErr()) {
        throw firstError.error;
      }

      throw {
        type: "network",
        message: "All search repositories failed",
      };
    }

    return this.mergeSearchResults(successResults, params, startTime);
  }

  private mergeSearchResults(
    successResults: Result<SearchResponse, SearchError>[],
    params: QueryParams,
    startTime: number,
  ): SearchResponse {
    const mergedResults: SearchResult[] = [];
    const sources: string[] = [];
    const sourceCounts: Record<string, number> = {};
    let totalResults = 0;

    for (const result of successResults) {
      if (result.isOk()) {
        const response = result.value;
        const source = response.source;

        sources.push(source);
        totalResults += response.totalResults;
        sourceCounts[source] = response.results.length;

        const resultsWithSource = response.results.map((r) => ({
          ...r,
          source: source,
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
          Object.entries(sourceCounts)
            .map(([source, count]) => `${source}: ${count}`)
            .join(", ")
        }\n`,
      ),
    );
    Deno.stderr.writeSync(
      encoder.encode(
        `${logHeader} Total search time: ${Date.now() - startTime}ms\n`,
      ),
    );

    return {
      query: params,
      results: sortedResults,
      totalResults,
      searchTime: Date.now() - startTime,
      source: sources.join(","),
    };
  }

  private classifyQuery(query: string): Result<QueryCategory, SearchError> {
    return this.queryClassifier.classifyQuery(query)
      .mapErr((error) => ({
        type: "classification_error",
        message: error.message,
      }));
  }

  private getRepositoriesForCategory(category: QueryCategory, query: string): SearchRepository[] {
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
