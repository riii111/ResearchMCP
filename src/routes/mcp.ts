import { Hono } from "hono";
import { z } from "zod";
import { SearchService } from "../services/searchService.ts";
import { McpErrorResponse, McpRequest, McpSuccessResponse } from "../models/mcp.ts";
import { err, ok } from "neverthrow";

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

type ParseError = {
  type: "parse";
  message: string;
};

function createErrorResponse(message: string, error?: string): McpErrorResponse {
  return {
    status: "error",
    message,
    results: [],
    error,
  };
}

export function createMcpRouter(searchService: SearchService): Hono {
  const router = new Hono();

  router.post("/search", async (c) => {
    const dataResult = await c.req.json()
      .then((data) => ok(data))
      .catch((error) =>
        err<McpRequest, ParseError>({
          type: "parse",
          message: error instanceof Error ? error.message : "Unknown error",
        })
      );
    if (dataResult.isErr()) {
      return c.json(
        createErrorResponse("Request parsing error", dataResult.error.message),
        400,
      );
    }

    const validationResult = mcpRequestSchema.safeParse(dataResult.value);
    if (!validationResult.success) {
      return c.json(
        createErrorResponse("Validation error", JSON.stringify(validationResult.error.format())),
        400,
      );
    }

    const request = validationResult.data as McpRequest;
    const searchResult = await searchService.searchMcp(request);
    return searchResult.match<Response>(
      (response) => c.json(response as McpSuccessResponse),
      (error) => {
        const statusCode = error.type === "validation" ? 400 : 500;
        const errorMessage = error.type === "validation" ? error.message : "Search error";
        const errorDetails = error.type === "search" ? error.details : undefined;

        return c.json(createErrorResponse(errorMessage, errorDetails), statusCode);
      },
    );
  });

  return router;
}
