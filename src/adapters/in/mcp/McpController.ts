import { Context, Hono } from "hono";
import { z } from "zod";
import { SearchUseCase } from "../../../application/ports/in/SearchUseCase.ts";
import {
  createMcpErrorResponse,
  McpError,
  McpParseError,
  McpRequest,
  McpResponse,
  McpSuccessResponse,
} from "../../../domain/models/mcp.ts";
import { err, ok, Result } from "neverthrow";
import { getErrorStatusCode } from "../../../utils/errors.ts";

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

  createRouter(): Hono {
    const router = new Hono();

    router.post("/search", async (c) => {
      try {
        // Parse JSON request body
        const jsonResult = await this.parseRequestBody(c);
        if (jsonResult.isErr()) {
          return this.handleError(c, jsonResult.error);
        }

        // Validate the request
        const validationResult = this.validateRequest(jsonResult.value);
        if (validationResult.isErr()) {
          return this.handleError(c, validationResult.error);
        }

        // Perform the search
        const searchResult = await this.performSearch(validationResult.value);

        // Handle the result
        return searchResult.match(
          // Success case
          (response) => c.json(response as McpSuccessResponse),
          // Error case
          (error) => this.handleError(c, error),
        );
      } catch (error) {
        // Handle unexpected errors
        console.error("Unexpected error in MCP controller:", error);
        return c.json(
          createMcpErrorResponse("Internal server error", "An unexpected error occurred"),
          { status: 500 },
        );
      }
    });

    return router;
  }

  private async parseRequestBody(c: Context): Promise<Result<unknown, McpParseError>> {
    return await c.req.json()
      .then((data) => ok(data))
      .catch((error) =>
        err<unknown, McpParseError>({
          type: "parse",
          message: error instanceof Error ? error.message : "Unknown error",
          details: undefined,
        })
      );
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
