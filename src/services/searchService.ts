import { err, ok, Result } from "neverthrow";
import { SearchAdapter } from "../adapters/searchAdapter.ts";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../models/search.ts";
import { McpError, McpRequest, McpResponse, McpResult } from "../models/mcp.ts";

export class SearchService {
  constructor(private readonly searchAdapter: SearchAdapter) {}

  async search(query: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return await this.searchAdapter.search(query);
  }

  async searchMcp(request: McpRequest): Promise<Result<McpResponse, McpError>> {
    if (!request.query) {
      return err({
        type: "validation",
        message: "Search query is required",
      });
    }

    const queryParams: QueryParams = {
      q: request.query,
      maxResults: request.options?.maxResults || 10,
      country: request.options?.country,
      language: request.options?.language,
    };

    const searchResult = await this.searchAdapter.search(queryParams);

    return searchResult.match<Result<McpResponse, McpError>>(
      (response) => {
        const results: McpResult[] = response.results.map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          published: result.published?.toISOString(),
        }));

        return ok({
          results,
          status: "success",
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
            if (error.issues.some(issue => issue.includes("cannot be properly encoded"))) {
              message = "The search query contains characters that cannot be processed. Brave Search API has limited support for non-Latin characters (like Japanese, Chinese, or Korean). Please try searching in English instead.";
            }
            break;
          case "authorization":
            message = error.message;
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

  filterByRelevance(
    results: ReadonlyArray<SearchResult>,
    minRank?: number,
  ): ReadonlyArray<SearchResult> {
    if (minRank === undefined) {
      return results;
    }

    return results.filter((result) => (result.rank || 0) >= minRank);
  }
}
