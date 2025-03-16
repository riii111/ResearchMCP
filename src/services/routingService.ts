import { err, ok, Result } from "neverthrow";
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
    // Use forced adapter if specified in routing options
    if (params.routing?.forceAdapter) {
      const adapterResult = searchAdapterRegistry.getAdapter(params.routing.forceAdapter);
      if (adapterResult.isErr()) {
        return err({
          type: "no_adapter_available",
          message: `Adapter ${params.routing.forceAdapter} not found`,
        });
      }

      // @ts-ignore: We know this is safe since we checked isErr()
      return await adapterResult._unsafeUnwrap().search(params);
    }

    // Use specified category or classify the query
    let category: QueryCategory;
    if (params.routing?.category) {
      category = params.routing.category;
    } else {
      const result = this.classifyQuery(params.q);
      if (result.isErr()) {
        return err(result.error);
      }
      // @ts-ignore: We know this is safe since we checked isErr()
      category = result._unsafeUnwrap();
    }

    // Get adapters for the category
    // @ts-ignore: category is guaranteed to be defined here
    const adapters = searchAdapterRegistry.getAdaptersForCategory(category, params.q);
    if (adapters.length === 0) {
      return err({
        type: "no_adapter_available",
        message: `No adapter available for category ${category}`,
      });
    }

    // Use parallel search if specified in routing options
    if (params.routing?.parallel) {
      return await this.multiSearch(params, category);
    }

    // Use primary adapter
    const primaryAdapter = adapters[0];
    return await primaryAdapter.search(params);
  }

  async multiSearch(
    params: QueryParams,
    category?: QueryCategory,
  ): Promise<Result<SearchResponse, SearchError>> {
    // If category not provided, classify the query
    if (!category) {
      const result = this.classifyQuery(params.q);
      if (result.isErr()) {
        return err(result.error);
      }
      // @ts-ignore: We know this is safe since we checked isErr()
      category = result._unsafeUnwrap();
    }

    // Get adapters for the category
    // @ts-ignore: category is guaranteed to be defined here
    const adapters = searchAdapterRegistry.getAdaptersForCategory(category, params.q);
    if (adapters.length === 0) {
      return err({
        type: "no_adapter_available",
        message: `No adapter available for category ${category}`,
      });
    }

    // Use up to 3 adapters for parallel search
    const selectedAdapters = adapters.slice(0, 3);

    // Execute searches in parallel
    const startTime = Date.now();
    const searchPromises = selectedAdapters.map((adapter) => adapter.search(params));
    const searchResults = await Promise.all(searchPromises);

    // Filter successful results
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

    // Extract and merge the results
    const mergedResults: SearchResult[] = [];
    const sources: string[] = [];
    let totalResults = 0;

    for (const result of successResults) {
      if (result.isOk()) {
        const response = result.value;
        sources.push(response.source);
        totalResults += response.totalResults;

        // Add source information to each result
        const resultsWithSource = response.results.map((r) => ({
          ...r,
          source: response.source,
        }));

        mergedResults.push(...resultsWithSource);
      }
    }

    // Deduplicate results by URL
    const uniqueResults = this.deduplicateResults(mergedResults);

    // Sort by rank/relevance
    const sortedResults = this.sortByRelevance(uniqueResults);

    // Return as a standard SearchResponse
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

    // @ts-ignore: We know this is safe since we checked isErr()
    return ok(categoryResult._unsafeUnwrap());
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
