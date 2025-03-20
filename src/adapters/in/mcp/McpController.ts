/// <reference lib="deno.ns" />
// @ts-nocheck - Ignoring type errors from MCP SDK and Zod version compatibility issues
import { Context, Hono } from "hono";
import { z } from "zod";
import { SearchUseCase } from "../../../application/ports/in/SearchUseCase.ts";
import {
  createMcpErrorResponse,
  McpError,
  McpParseError,
  McpRequest,
  McpResponse,
  McpResult,
  McpSuccessResponse,
} from "../../../domain/models/mcp.ts";
import { err, ok, Result } from "neverthrow";
import { getErrorStatusCode } from "../../../domain/models/errors.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { error, info } from "../../../config/logger.ts";

type McpControllerError = McpError | McpParseError;

/**
 * Controller for MCP API endpoints
 */
export class McpController {
  private readonly mcpRequestSchema = z.object({
    query: z.string().min(1).max(200),
    context: z.array(z.string()).optional(),
    options: z.object({
      maxResults: z.number().int().min(1).max(50).optional(),
      country: z.string().length(2).optional(),
      language: z.string().min(2).max(5).optional(),
      freshness: z.enum(["day", "week", "month"]).optional(),
    }).optional(),
  });

  constructor(private readonly searchUseCase: SearchUseCase) {}

  /**
   * Register the search tool with the MCP server
   */
  registerSearchTool(server: McpServer): void {
    server.tool(
      "search",
      "Search the web for information",
      {
        query: z.string().min(1).max(200),
        context: z.array(z.string()).optional(),
        maxResults: z.number().int().min(1).max(50).optional(),
        country: z.string().length(2).optional(),
        language: z.string().min(2).max(5).optional(),
        freshness: z.enum(["day", "week", "month"]).optional(),
      },
      async (params, _extra) => {
        info(`MCP search request: ${params.query}`);

        const searchResult = await this.searchUseCase.searchMcp({
          query: params.query,
          context: params.context,
          options: {
            maxResults: params.maxResults,
            country: params.country,
            language: params.language,
            freshness: params.freshness,
          },
        });

        return searchResult.match(
          (response) => {
            return {
              content: [
                {
                  type: "text",
                  text: this.formatSearchResults(response.results),
                },
              ],
            };
          },
          (err) => {
            error(`Search error: ${JSON.stringify(err)}`);
            let errorMessage = "";

            switch (err.type) {
              case "invalidQuery":
                errorMessage = `${err.message}${err.issues ? "\n\n" + err.issues.join("\n") : ""}`;
                break;
              case "validation":
                errorMessage = `Validation error: ${err.message}`;
                break;
              case "search":
                errorMessage = `Search error: ${err.details}`;
                break;
              case "server":
                errorMessage = `Server error: ${err.message}`;
                break;
              default:
                errorMessage = `Error: ${err.message || "Unknown error"}`;
            }

            return {
              content: [
                {
                  type: "text",
                  text: errorMessage,
                },
              ],
              isError: true,
            };
          },
        );
      },
    );
  }

  private formatSearchResults(results: ReadonlyArray<McpResult>): string {
    if (results.length === 0) {
      return "No results found.";
    }

    return results
      .map((result, index) => {
        const publishedDate = result.published
          ? `(${new Date(result.published).toLocaleDateString()})`
          : "";
        const source = result.source ? `[Source: ${result.source}]` : "";

        return `${index + 1}. ${result.title} ${publishedDate} ${source}
   URL: ${result.url}
   ${result.snippet}
`;
      })
      .join("\n");
  }

  createRouter(): Hono {
    const router = new Hono();

    router.post("/search", async (c) => {
      return await this.parseRequestBody(c)
        .andThen((data) => this.validateRequest(data))
        .andThen((request) => this.performSearch(request))
        .match(
          (response) => c.json(response as McpSuccessResponse),
          (error) => this.handleError(c, error),
        );
    });

    return router;
  }

  private createServerErrorResponse(): McpError {
    return {
      type: "server",
      message: "Internal server error",
      details: "An unexpected error occurred",
    };
  }

  private async parseRequestBody(c: Context): Promise<Result<unknown, McpParseError>> {
    return await c.req.json()
      .then((data) => ok(data))
      .catch((err) => {
        error(
          `JSON parse error: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
        return err<unknown, McpParseError>({
          type: "parse",
          message: err instanceof Error ? err.message : "Unknown error",
          details: undefined,
        });
      });
  }

  private validateRequest(data: unknown): Result<McpRequest, McpError> {
    return this.mcpRequestSchema.safeParse(data).match(
      (data) => ok(data as McpRequest),
      (error) =>
        err({
          type: "validation",
          message: "Validation error",
          details: JSON.stringify(error.format()),
        }),
    );
  }

  private async performSearch(request: McpRequest): Promise<Result<McpResponse, McpError>> {
    return await this.searchUseCase.searchMcp(request)
      .map((response) => {
        info(
          `[MCP_CONTROLLER] Search successful, returned ${response.results.length} results from source: ${response.source}`,
        );

        // Log the first few results
        const maxResultsToLog = Math.min(3, response.results.length);
        response.results.slice(0, maxResultsToLog).forEach((result, i) => {
          info(
            `[MCP_CONTROLLER] Result ${i + 1}: ${result.title} [Source: ${result.source}]`,
          );
        });

        return response;
      })
      .mapErr((err) => {
        error(
          `[MCP_CONTROLLER] Search failed: ${err.type} - ${err.message}`,
        );

        return err;
      });
  }

  private handleError(c: Context, error: McpControllerError): Response {
    const statusCode = getErrorStatusCode(error);
    const errorMessage = error.type === "validation" ? error.message : "Search error";
    const errorDetails = error.type === "search" ? error.details : undefined;

    return c.json(
      createMcpErrorResponse(errorMessage, errorDetails),
      { status: statusCode },
    );
  }
}
