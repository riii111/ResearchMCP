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
import { getErrorStatusCode } from "../../../utils/errors.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

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
        Deno.stderr.writeSync(new TextEncoder().encode(`MCP search request: ${params.query}\n`));

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
          (error) => {
            Deno.stderr.writeSync(
              new TextEncoder().encode(`Search error: ${JSON.stringify(error)}\n`),
            );
            let errorMessage = "";

            switch (error.type) {
              case "validation":
                errorMessage = `Validation error: ${error.message}`;
                break;
              case "search":
                errorMessage = `Search error: ${error.details}`;
                break;
              case "server":
                errorMessage = `Server error: ${error.message}`;
                break;
              default:
                errorMessage = `Error: ${error.message || "Unknown error"}`;
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

        return `${index + 1}. ${result.title} ${publishedDate}
   URL: ${result.url}
   ${result.snippet}
`;
      })
      .join("\n");
  }

  createRouter(): Hono {
    const router = new Hono();

    router.post("/search", async (c) => {
      const jsonResult = await this.parseRequestBody(c);
      if (jsonResult.isErr()) {
        return this.handleError(c, jsonResult.error);
      }

      const validationResult = this.validateRequest(jsonResult.value);
      if (validationResult.isErr()) {
        return this.handleError(c, validationResult.error);
      }

      const searchResult = await this.performSearch(validationResult.value);

      return searchResult.match(
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
      .catch((error) => {
        Deno.stderr.writeSync(
          new TextEncoder().encode(
            `JSON parse error: ${error instanceof Error ? error.message : "Unknown error"}\n`,
          ),
        );
        return err<unknown, McpParseError>({
          type: "parse",
          message: error instanceof Error ? error.message : "Unknown error",
          details: undefined,
        });
      });
  }

  private validateRequest(data: unknown): Result<McpRequest, McpError> {
    const validationResult = this.mcpRequestSchema.safeParse(data);

    if (validationResult.success) {
      return ok(validationResult.data as McpRequest);
    } else {
      return err({
        type: "validation",
        message: "Validation error",
        details: JSON.stringify(validationResult.error.format()),
      });
    }
  }

  private async performSearch(request: McpRequest): Promise<Result<McpResponse, McpError>> {
    return await this.searchUseCase.searchMcp(request);
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
