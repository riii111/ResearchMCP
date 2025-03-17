import { err, ok, Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../models/search.ts";
import { McpError, McpRequest, McpResponse, McpResult } from "../models/mcp.ts";
import { RoutingOptions } from "../models/routing.ts";
import { RoutingService } from "./routingService.ts";

/**
 * Service for handling search requests and responses
 */
export class SearchService {
  constructor(private readonly routingService: RoutingService) {}

  async search(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return await this.routingService.routeAndSearch(params);
  }

  async multiSearch(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return await this.routingService.multiSearch(params);
  }

  /**
   * Handle MCP search requests
   */
  async searchMcp(request: McpRequest): Promise<Result<McpResponse, McpError>> {
    if (!request.query) {
      return err({
        type: "validation",
        message: "Search query is required",
      });
    }

    const routingOptions: RoutingOptions = {
      parallel: request.options?.parallel === true,
      forceAdapter: request.options?.adapter,
    };

    const queryParams: QueryParams = {
      q: request.query,
      maxResults: request.options?.maxResults || 10,
      country: request.options?.country,
      language: request.options?.language,
      routing: routingOptions,
    };

    // Use parallel search if requested, otherwise use standard routing
    const searchResult = routingOptions.parallel
      ? await this.multiSearch(queryParams)
      : await this.search(queryParams);

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
          details: message,
        });
      },
    );
  }

  /**
   * Filter search results by relevance score or rank
   */
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
