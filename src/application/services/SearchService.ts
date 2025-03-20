import { err, Result } from "neverthrow";
import {
  QueryParams,
  SearchError,
  SearchResponse,
  SearchResult,
} from "../../domain/models/search.ts";
import { McpError, McpRequest, McpResponse } from "../../domain/models/mcp.ts";
import { SearchUseCase } from "../ports/in/SearchUseCase.ts";
import { RoutingService } from "./RoutingService.ts";

/**
 * Implementation of the SearchUseCase port
 * Handles search operations and transformations
 */
export class SearchService implements SearchUseCase {
  constructor(private readonly routingService: RoutingService) {}

  async multiSearch(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return await this.routingService.multiSearch(params);
  }

  async searchMcp(request: McpRequest): Promise<Result<McpResponse, McpError>> {
    if (!request.query) {
      return err({
        type: "validation",
        message: "Search query is required",
        details: undefined,
      });
    }

    const queryParams: QueryParams = {
      q: request.query,
      maxResults: request.options?.maxResults || 20,
      country: request.options?.country,
      language: request.options?.language,
      routing: {},
    };

    return (await this.multiSearch(queryParams))
      .map((response) => ({
        results: response.results.map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          published: result.published?.toISOString(),
          source: result.source,
        })),
        status: "success" as const,
        source: response.source,
      }))
      .mapErr((error) => {
        const errorHandlers = {
          network: (e: { message: string }) => `Network error: ${e.message}`,

          rateLimit: (e: { message: string; retryAfterMs: number }) =>
            `Rate limit: Retry after ${Math.floor(e.retryAfterMs / 1000)} seconds`,

          invalidQuery: (e: { message: string; issues: string[] }) => {
            return e.issues.some((issue) => issue.includes("cannot be properly encoded"))
              ? "The search query contains characters that cannot be processed by some search engines. We're trying multiple search providers, but some may fail with non-Latin characters or special symbols. Results may be limited."
              : `Invalid query: ${e.issues.join(", ")}`;
          },

          authorization: (e: { message: string }) => e.message,

          classification_error: (e: { message: string }) =>
            `Query classification error: ${e.message}`,

          no_adapter_available: (e: { message: string }) =>
            `No search provider available: ${e.message}`,
        };

        const handler = errorHandlers[error.type as keyof typeof errorHandlers] as (
          e: SearchError,
        ) => string;
        const details = handler ? handler(error) : "Unknown error";

        return {
          type: "search",
          message: "Search failed",
          details,
        };
      });
  }

  filterByRelevance(
    results: ReadonlyArray<SearchResult>,
    minScore?: number,
  ): ReadonlyArray<SearchResult> {
    if (minScore === undefined) {
      return results;
    }

    return results.filter((result) => {
      // Use relevanceScore if available, otherwise fall back to normalized rank
      const score = result.relevanceScore !== undefined
        ? result.relevanceScore
        : (result.rank ? 1 - (result.rank / 100) : 0);

      return score >= minScore;
    });
  }
}
