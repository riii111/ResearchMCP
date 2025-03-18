import { Hono } from "hono";
import { z } from "zod";
import { SearchService } from "../services/searchService.ts";
import {
  createMcpErrorResponse,
  McpError,
  McpParseError,
  McpRequest,
  McpSuccessResponse,
} from "../models/mcp.ts";
import { err, ok } from "neverthrow";
import { getErrorStatusCode } from "../utils/errors.ts";

const mcpRequestSchema = z.object({
  query: z.string().min(1).max(200),
  context: z.array(z.string()).optional(),
  options: z.object({
    maxResults: z.number().int().min(1).max(50).optional(),
    country: z.string().length(2).optional(),
    language: z.string().min(2).max(5).optional(),
    freshness: z.enum(["day", "week", "month"]).optional(),
  }).optional(),
});

export function createMcpRouter(searchService: SearchService): Hono {
  const router = new Hono();

  // Mark with void to satisfy neverthrow linter
  void router.post("/search", (c) => handleMcpRequest(c, searchService));

  return router;
}

async function handleMcpRequest(
  c: Parameters<Hono["post"]>[1],
  searchService: SearchService
): Promise<Response> {
  const jsonResult = await c.req.json()
    .then((data) => ok(data))
    .catch((error) =>
      err<McpRequest, McpParseError>({
        type: "parse",
        message: error instanceof Error ? error.message : "Unknown error",
        details: undefined,
      })
    );

  return jsonResult.match(
    (jsonData) => {
      const validationResult = mcpRequestSchema.safeParse(jsonData);
      if (!validationResult.success) {
        const validationError: McpError = {
          type: "validation",
          message: "Validation error",
          details: JSON.stringify(validationResult.error.format()),
        };
        return c.json(
          createMcpErrorResponse("Validation error", validationError.details),
          { status: getErrorStatusCode(validationError) },
        );
      }

      return processValidatedRequest(c, searchService, validationResult.data as McpRequest);
    },
    (parseError) => {
      return c.json(
        createMcpErrorResponse("Request parsing error", parseError.message),
        { status: getErrorStatusCode(parseError) },
      );
    },
  );
}

async function processValidatedRequest(
  c: Parameters<Hono["post"]>[1],
  searchService: SearchService,
  request: McpRequest,
): Promise<Response> {
  const searchResult = await searchService.searchMcp(request);
  return searchResult.match<Response>(
    (response) => c.json(response as McpSuccessResponse),
    (error) => {
      const statusCode = getErrorStatusCode(error);
      const errorMessage = error.type === "validation" ? error.message : "Search error";
      const errorDetails = error.type === "search" ? error.details : undefined;

      return c.json(
        createMcpErrorResponse(errorMessage, errorDetails),
        { status: statusCode },
      );
    },
  );
}
