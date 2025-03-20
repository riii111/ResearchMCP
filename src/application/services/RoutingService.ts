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
    repositories.forEach((repo) =>
      debug(`[PARALLEL_SEARCH_DETAIL] - Using repository: ${repo.getId()} (${repo.getName()})`)
    );

    const searchResults = repositories.map((repository) => ({
      repository,
      resultPromise: repository.search(params),
    }));

    // Execute parallel searches
    return ResultAsync.fromSafePromise(
      Promise.all(searchResults.map((item) => item.resultPromise)),
    ).andThen((results) => {
      const searchWithResults = searchResults.map((item, index) => ({
        repository: item.repository,
        result: results[index],
      }));

      this.logSearchResults(searchWithResults);

      return this.processSearchResults(searchWithResults, params, startTime);
    });
  }

  private processSearchResults(
    searchWithResults: Array<
      { repository: SearchRepository; result: Result<SearchResponse, SearchError> }
    >,
    params: QueryParams,
    startTime: number,
  ): ResultAsync<SearchResponse, SearchError> {
    const successResults = searchWithResults
      .filter((item) => item.result.isOk())
      .map((item) => item.result as Result<SearchResponse, never>);

    if (successResults.length > 0) {
      const mergedResults = this.mergeSearchResults(successResults, params, startTime);
      return ResultAsync.fromSafePromise(Promise.resolve(mergedResults));
    }

    const firstError = searchWithResults
      .find((item) => item.result.isErr())
      ?.result;

    const errorPayload = firstError?.isErr()
      ? firstError.error
      : { type: "network" as const, message: "All search repositories failed" };

    return ResultAsync.fromPromise(
      Promise.reject(errorPayload),
      (e) => e as SearchError,
    );
  }

  private logSearchResults(
    searchWithResults: Array<
      { repository: SearchRepository; result: Result<SearchResponse, SearchError> }
    >,
  ): void {
    const successItems = searchWithResults.filter((item) => item.result.isOk());
    const failedItems = searchWithResults.filter((item) => item.result.isErr());

    info(
      `[PARALLEL_SEARCH_DETAIL] Results: ${successItems.length} succeeded, ${failedItems.length} failed`,
    );

    successItems.forEach((item) => {
      const resultCount = item.result.isOk() ? item.result.value.results.length : 0;
      const repoName = item.repository.getName();
      info(`[PARALLEL_SEARCH_DETAIL] Repository ${repoName} succeeded with ${resultCount} results`);
    });

    failedItems.forEach((item) => {
      const error = item.result.isErr()
        ? item.result.error
        : { type: "unknown", message: "Unknown error" };
      const repoName = item.repository.getName();
      info(`[SEARCH_ERROR] Repository ${repoName} failed: ${error.type} - ${error.message}`);
    });
  }

  private mergeSearchResults(
    successResults: Result<SearchResponse, SearchError>[],
    params: QueryParams,
    startTime: number,
  ): SearchResponse {
    const validResponses = successResults
      .filter((result) => result.isOk())
      .map((result) => result.value);

    const sources = validResponses.map((response) => response.source);

    // Record result counts per source for analytics
    const sourceCounts = validResponses.reduce<Record<string, number>>(
      (counts, response) => ({
        ...counts,
        [response.source]: response.results.length,
      }),
      {},
    );

    const totalResults = validResponses.reduce(
      (total, response) => total + response.totalResults,
      0,
    );

    // Flatten all results and attach source information
    const mergedResults = validResponses.flatMap((response) =>
      response.results.map((result) => ({
        ...result,
        source: response.source,
      }))
    );

    // Remove duplicates and optimize relevance order
    const uniqueResults = this.deduplicateResults(mergedResults);
    const sortedResults = this.sortByRelevance(uniqueResults);

    const searchTime = Date.now() - startTime;

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
    info(`[PARALLEL_SEARCH_RESULTS] Total search time: ${searchTime}ms`);

    return {
      query: params,
      results: sortedResults,
      totalResults,
      searchTime,
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
