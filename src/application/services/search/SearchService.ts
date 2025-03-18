import { err, ok, Result } from "neverthrow";
import {
  QueryParams,
  SearchError,
  SearchResponse,
  SearchResult,
} from "../../../domain/models/search.ts";
import { McpError, McpRequest, McpResponse, McpResult } from "../../../domain/models/mcp.ts";
import { SearchUseCase } from "../../ports/in/SearchUseCase.ts";
import { RoutingService } from "./RoutingService.ts";

/**
 * Implementation of the SearchUseCase port
 * Handles search operations and transformations
 */
export class SearchService implements SearchUseCase {
  constructor(private readonly routingService: RoutingService) {}

  async search(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return await this.routingService.routeAndSearch(params);
  }

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

    const searchResult = await this.search(queryParams);

    return searchResult.match<Result<McpResponse, McpError>>(
      (response) => {
        const results: McpResult[] = response.results.map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          published: result.published?.toISOString(),
          source: result.source,
        }));

        return ok({
          results,
          status: "success",
          source: response.source,
        });
      },
      (error) => {
        let message: string;

        switch (error.type) {
          case "network":
            message = `Network error: ${error.message}`;
            break;
          case "rateLimit":
            message = `Rate limit: Retry after ${Math.floor(error.retryAfterMs / 1000)} seconds`;
            break;
          case "invalidQuery":
            message = `Invalid query: ${error.issues.join(", ")}`;
            // Provide more user-friendly message for Latin1 encoding errors
            if (error.issues.some((issue) => issue.includes("cannot be properly encoded"))) {
              message =
                "The search query contains characters that cannot be processed. Some search APIs have limited support for non-Latin characters (like Japanese, Chinese, or Korean). Please try searching in English instead.";
            }
            break;
          case "authorization":
            message = error.message;
            break;
          case "classification_error":
            message = `Query classification error: ${error.message}`;
            break;
          case "no_adapter_available":
            message = `No search provider available: ${error.message}`;
            break;
          default:
            message = "Unknown error";
        }

        return err({
          type: "search",
          message: "Search failed",
          details: message,
        });
      },
    );
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
