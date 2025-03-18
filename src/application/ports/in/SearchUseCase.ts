import { Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse } from "../../../domain/models/search.ts";
import { McpError, McpRequest, McpResponse } from "../../../domain/models/mcp.ts";

/**
 * Input port for search functionality
 * Defines the interface for search operations that can be used by controllers or other input adapters
 */
export interface SearchUseCase {
  search(params: QueryParams): Promise<Result<SearchResponse, SearchError>>;

  multiSearch(params: QueryParams): Promise<Result<SearchResponse, SearchError>>;

  searchMcp(request: McpRequest): Promise<Result<McpResponse, McpError>>;
}
