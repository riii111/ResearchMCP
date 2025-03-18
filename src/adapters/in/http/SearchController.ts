import { Context, Hono } from "hono";
import { SearchUseCase } from "../../../application/ports/in/SearchUseCase.ts";
import { QueryParams, SearchError, SearchResponse } from "../../../domain/models/search.ts";
import { Result } from "neverthrow";

/**
 * Controller for HTTP API endpoints
 */
export class SearchController {
  constructor(private readonly searchUseCase: SearchUseCase) {}

  createRouter(): Hono {
    const router = new Hono();

    router.get("/search", async (c) => {
      return this.handleSearchRequest(c);
    });

    return router;
  }

  private async handleSearchRequest(c: Context): Promise<Response> {
    const query = c.req.query("q");
    if (!query) {
      return c.json({ error: "Search query is required" }, { status: 400 });
    }

    const maxResults = c.req.query("maxResults") ? parseInt(c.req.query("maxResults")!) : 20;
    const country = c.req.query("country");
    const language = c.req.query("language");

    const params: QueryParams = {
      q: query,
      maxResults,
      country,
      language,
      routing: {},
    };

    const result = await this.searchUseCase.multiSearch(params);

    return result.match(
      (response) => c.json(response),
      (error) => this.handleSearchError(c, error),
    );
  }

  private handleSearchError(c: Context, error: SearchError): Response {
    const { statusCode, message } = this.mapErrorToResponse(error);
    return c.json({ error: message }, { status: statusCode });
  }

  private mapErrorToResponse(error: SearchError): { statusCode: number; message: string } {
    switch (error.type) {
      case "network":
        return {
          statusCode: 503,
          message: `Network error: ${error.message}`,
        };
      case "rateLimit":
        return {
          statusCode: 429,
          message: `Rate limit: Retry after ${Math.floor(error.retryAfterMs / 1000)} seconds`,
        };
      case "invalidQuery":
        return {
          statusCode: 400,
          message: `Invalid query: ${error.issues.join(", ")}`,
        };
      case "authorization":
        return {
          statusCode: 401,
          message: error.message,
        };
      case "classification_error":
        return {
          statusCode: 500,
          message: `Query classification error: ${error.message}`,
        };
      case "no_adapter_available":
        return {
          statusCode: 503,
          message: `No search provider available: ${error.message}`,
        };
      default:
        return {
          statusCode: 500,
          message: "Internal server error",
        };
    }
  }
}
