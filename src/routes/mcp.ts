import { Hono } from "hono";
import { z } from "npm:zod@3.22.4";
import { SearchService } from "../services/searchService.ts";
import { McpRequest, McpSuccessResponse, McpErrorResponse } from "../models/mcp.ts";

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

  router.post("/search", async (c) => {
    try {
      const data = await c.req.json();
      const result = mcpRequestSchema.safeParse(data);
      
      if (!result.success) {
        const errorResponse: McpErrorResponse = {
          status: "error",
          message: "Validation error",
          results: [],
          error: JSON.stringify(result.error.format()),
        };
        return c.json(errorResponse, 400);
      }
      
      const request = result.data as McpRequest;
      const searchResult = await searchService.searchMcp(request);

      return searchResult.match(
        (response) => {
          return c.json(response as McpSuccessResponse);
        },
        (error) => {
          const errorResponse: McpErrorResponse = {
            status: "error",
            message: error.type === "validation" ? error.message : "Search error",
            results: [],
            error: error.type === "search" ? error.details : undefined,
          };
          return c.json(errorResponse, error.type === "validation" ? 400 : 500);
        }
      );
    } catch (error) {
      const errorResponse: McpErrorResponse = {
        status: "error",
        message: "Request parsing error",
        results: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return c.json(errorResponse, 400);
    }
  });

  return router;
}