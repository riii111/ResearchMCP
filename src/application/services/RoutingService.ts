import { Result, ResultAsync } from "neverthrow";
import {
  QueryParams,
  SearchError,
  SearchResponse,
  SearchResult,
} from "../../domain/models/search.ts";
import { QueryCategory } from "../../domain/models/routing.ts";
import { QueryClassifierPort } from "../ports/out/QueryClassifierPort.ts";
import { SearchRepository } from "../ports/out/SearchRepository.ts";
import { debug, info } from "../../config/logger.ts";
import { err, ok } from "neverthrow";

/**
 * Service for routing search queries to appropriate search repositories
 */
export class RoutingService {
  constructor(
    private readonly queryClassifier: QueryClassifierPort,
    private readonly searchRepositories: SearchRepository[],
  ) {}

  multiSearch(
    params: QueryParams,
    category?: QueryCategory,
  ): ResultAsync<SearchResponse, SearchError> {
    const categoryResult: ResultAsync<QueryCategory, SearchError> = category
      ? ResultAsync.fromSafePromise(Promise.resolve(category))
      // If category is not specified
      : this.classifyQuery(params.q).match(
        (validCategory) => ResultAsync.fromSafePromise(Promise.resolve(validCategory)),
        (error) => ResultAsync.fromPromise(Promise.reject(error), (e) => e as SearchError),
      );

    return categoryResult.andThen((resolvedCategory) =>
      this.getRepositoriesForCategory(resolvedCategory, params.q).match(
        (repositories) => {
          this.logSearchInfo(params, resolvedCategory, repositories);
          return this.executeParallelSearches(repositories, params);
        },
        (error) =>
          ResultAsync.fromPromise(
            Promise.reject(error),
            (e) => e as SearchError,
          ),
      )
    );
  }

  private logSearchInfo(
    params: QueryParams,
    category: QueryCategory,
    repositories: SearchRepository[],
  ): void {
    info(
      `[PARALLEL_SEARCH] Query category: ${category}, Query: "${params.q.substring(0, 50)}${
        params.q.length > 50 ? "..." : ""
      }"`,
    );

    info(`[PARALLEL_SEARCH] All registered repositories: ${this.searchRepositories.length}`);
    for (const repo of this.searchRepositories) {
      info(
        `[PARALLEL_SEARCH] - Repository: ${repo.getId()} (${repo.getName()}), Categories: ${
          repo.getSupportedCategories().join(", ")
        }`,
      );
    }

    info(
      `[PARALLEL_SEARCH] Available repositories: ${
        repositories.map((r) =>
          `${r.getId()} (${r.getName()}, score=${
            r.getRelevanceScore(params.q, category).toFixed(2)
          })`
        ).join(", ")
      }`,
    );
    info(
      `[PARALLEL_SEARCH] Selected repositories for parallel search: ${
        repositories.map((r) => `${r.getId()} (${r.getName()})`).join(", ")
      }`,
    );
  }

  private executeParallelSearches(
    repositories: SearchRepository[],
    params: QueryParams,
  ): ResultAsync<SearchResponse, SearchError> {
    const startTime = Date.now();

    debug(
      `[PARALLEL_SEARCH_DETAIL] Executing search for query: "${params.q}" with ${repositories.length} repositories`,
    );

    for (const repo of repositories) {
      debug(
        `[PARALLEL_SEARCH_DETAIL] - Using repository: ${repo.getId()} (${repo.getName()})`,
      );
    }

    const searchPromises = repositories.map((repository) => repository.search(params));

    return ResultAsync.fromSafePromise(Promise.all(searchPromises))
      .andThen((results) => {
        this.logSearchResults(results, repositories);

        const successResults = results.filter((result) => result.isOk());
        const failedResults = results.filter((result) => result.isErr());

        if (successResults.length === 0) {
          if (failedResults.length > 0) {
            const firstError = failedResults[0];
            return ResultAsync.fromPromise(
              Promise.reject(firstError.error),
              (e) => e as SearchError,
            );
          }

          return ResultAsync.fromPromise(
            Promise.reject({
              type: "network",
              message: "All search repositories failed",
            }),
            (e) => e as SearchError,
          );
        }

        const mergedResults = this.mergeSearchResults(successResults, params, startTime);
        return ResultAsync.fromSafePromise(Promise.resolve(mergedResults));
      });
  }

  private logSearchResults(
    searchResults: Result<SearchResponse, SearchError>[],
    repositories: SearchRepository[],
  ): void {
    const successResults = searchResults.filter((result) => result.isOk());
    const failedResults = searchResults.filter((result) => result.isErr());

    info(
      `[PARALLEL_SEARCH_DETAIL] Results: ${successResults.length} succeeded, ${failedResults.length} failed`,
    );

    for (let i = 0; i < successResults.length; i++) {
      const result = successResults[i];
      if (result.isOk()) {
        const repoIndex = searchResults.indexOf(result);
        const repoName = repoIndex >= 0 && repoIndex < repositories.length
          ? repositories[repoIndex].getName()
          : "Unknown";
        const resultCount = result.value.results.length;

        info(
          `[PARALLEL_SEARCH_DETAIL] Repository ${repoName} succeeded with ${resultCount} results`,
        );
      }
    }

    for (let i = 0; i < failedResults.length; i++) {
      const result = failedResults[i];
      if (result.isErr()) {
        const error = result.error;
        const repoIndex = searchResults.indexOf(result);
        const repoName = repoIndex >= 0 && repoIndex < repositories.length
          ? repositories[repoIndex].getName()
          : "Unknown";

        info(
          `[SEARCH_ERROR] Repository ${repoName} failed: ${error.type} - ${error.message}`,
        );
      }
    }
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

    info(
      `[PARALLEL_SEARCH_RESULTS] Total raw results: ${mergedResults.length}, Unique results after deduplication: ${uniqueResults.length}`,
    );
    info(
      `[PARALLEL_SEARCH_RESULTS] Results per source: ${
        Object.entries(sourceCounts)
          .map(([source, count]) => `${source}: ${count}`)
          .join(", ")
      }`,
    );
    info(
      `[PARALLEL_SEARCH_RESULTS] Total search time: ${Date.now() - startTime}ms`,
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

  private getRepositoriesForCategory(
    category: QueryCategory,
    query: string,
  ): Result<SearchRepository[], SearchError> {
    const supportingRepositories = this.searchRepositories.filter((repository) =>
      repository.getSupportedCategories().includes(category)
    );

    const sortedRepositories = supportingRepositories.sort((a, b) => {
      const scoreA = a.getRelevanceScore(query, category);
      const scoreB = b.getRelevanceScore(query, category);
      return scoreB - scoreA;
    });

    return sortedRepositories.length > 0 ? ok(sortedRepositories) : err({
      type: "no_adapter_available" as const,
      message: `No repository available for category ${category}`,
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
      if (a.relevanceScore !== undefined && b.relevanceScore !== undefined) {
        return b.relevanceScore - a.relevanceScore;
      }

      const rankA = a.rank || 100;
      const rankB = b.rank || 100;
      return rankA - rankB;
    });
  }
}
