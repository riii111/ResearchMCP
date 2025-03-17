import { err, Ok, ok, Result } from "neverthrow";
import { searchAdapterRegistry } from "../adapters/search/registry.ts";
import { QueryClassifierService } from "./queryClassifierService.ts";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../models/search.ts";
import { QueryCategory } from "../models/routing.ts";

/**
 * Service for routing search queries to appropriate search adapters
 */
export class RoutingService {
  constructor(
    private readonly queryClassifier: QueryClassifierService,
  ) {}

  async routeAndSearch(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    let category: QueryCategory;
    if (params.routing?.category) {
      category = params.routing.category;
    } else {
      const result = this.classifyQuery(params.q);
      if (result.isErr()) {
        return err(result.error);
      }

      category = (result as Ok<QueryCategory, SearchError>)._unsafeUnwrap();
    }

    const adapters = searchAdapterRegistry.getAdaptersForCategory(category, params.q);
    if (adapters.length === 0) {
      return err({
        type: "no_adapter_available",
        message: `No adapter available for category ${category}`,
      });
    }

    if (params.routing?.parallel) {
      return await this.multiSearch(params, category);
    }

    const primaryAdapter = adapters[0];
    console.error(
      `[INFO] Using search adapter: ${primaryAdapter.id} (${primaryAdapter.name}) for query: "${
        params.q.substring(0, 50)
      }${params.q.length > 50 ? "..." : ""}" (category: ${category})`,
    );

    return await primaryAdapter.search(params);
  }

  /**
   * Execute search in parallel with multiple adapters
   */
  async multiSearch(
    params: QueryParams,
    category?: QueryCategory,
  ): Promise<Result<SearchResponse, SearchError>> {
    if (!category) {
      const result = this.classifyQuery(params.q);
      if (result.isErr()) {
        return err(result.error);
      }

      category = (result as Ok<QueryCategory, SearchError>)._unsafeUnwrap();
    }

    // Get adapters for this category
    const adapters = searchAdapterRegistry.getAdaptersForCategory(category, params.q);
    if (adapters.length === 0) {
      return err({
        type: "no_adapter_available",
        message: `No adapter available for category ${category}`,
      });
    }

    // Use up to 3 adapters for parallel search
    const selectedAdapters = adapters.slice(0, 3);

    console.error(
      `[INFO] Using multiple search adapters for parallel search: ${
        selectedAdapters.map((a) => `${a.id} (${a.name})`).join(", ")
      } (category: ${category})`,
    );
    console.error(
      `[INFO] Query: "${params.q.substring(0, 50)}${params.q.length > 50 ? "..." : ""}"`,
    );

    // Execute searches in parallel
    const startTime = Date.now();
    const searchPromises = selectedAdapters.map((adapter) => adapter.search(params));
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
        message: "All search adapters failed",
      });
    }

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

    // Sort by rank/relevance
    const sortedResults = this.sortByRelevance(uniqueResults);

    return ok({
      query: params,
      results: sortedResults,
      totalResults,
      searchTime: Date.now() - startTime,
      source: sources.join(","),
    });
  }

  private classifyQuery(query: string): Result<QueryCategory, SearchError> {
    const categoryResult = this.queryClassifier.classifyQuery(query);

    if (categoryResult.isErr()) {
      return err({
        type: "classification_error",
        message: categoryResult.error.message,
      });
    }

    return ok((categoryResult as Ok<QueryCategory, Error>)._unsafeUnwrap());
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
