import { Result, ok, err } from "neverthrow";
import { SearchAdapter } from "../adapters/searchAdapter.ts";
import { QueryParams, SearchResponse, SearchError, SearchResult } from "../models/search.ts";
import { McpRequest, McpResponse, McpError, McpResult } from "../models/mcp.ts";

export class SearchService {
  constructor(private readonly searchAdapter: SearchAdapter) {}

  async search(query: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    return await this.searchAdapter.search(query);
  }

  async searchMcp(request: McpRequest): Promise<Result<McpResponse, McpError>> {
    if (!request.query) {
      return err({
        type: "validation",
        message: "検索クエリが必要です",
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
            message = `ネットワークエラー: ${error.message}`;
            break;
          case "rateLimit":
            message = `レート制限: ${Math.floor(error.retryAfterMs / 1000)}秒後に再試行してください`;
            break;
          case "invalidQuery":
            message = `無効なクエリ: ${error.issues.join(", ")}`;
            break;
          case "authorization":
            message = error.message;
            break;
          default:
            message = "不明なエラー";
        }

        return err({
          type: "search",
          details: message,
        });
      }
    );
  }

  filterByRelevance(results: ReadonlyArray<SearchResult>, minRank?: number): ReadonlyArray<SearchResult> {
    if (minRank === undefined) {
      return results;
    }
    
    return results.filter((result) => (result.rank || 0) >= minRank);
  }
}