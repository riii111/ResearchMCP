import { Hono } from "hono";
import { z } from "npm:zod@3.22.4";
import { ResearchService } from "../services/researchService.ts";
import { McpRequest } from "../models/mcp.ts";

const researchRequestSchema = z.object({
  query: z.string().min(1).max(200),
  context: z.array(z.string()).optional(),
  options: z.object({
    maxResults: z.number().int().min(1).max(50).optional(),
    country: z.string().length(2).optional(),
    language: z.string().min(2).max(5).optional(),
    freshness: z.enum(["day", "week", "month"]).optional(),
  }).optional(),
});

// Define response types
export interface ResearchSuccessResponse {
  status: "success";
  result: {
    query: string;
    searchResults: ReadonlyArray<unknown>;
    summary: string;
    insights: string[];
    sources: string[];
  };
}

export interface ResearchErrorResponse {
  status: "error";
  message: string;
  type?: string;
  error?: unknown;
  result?: {
    query: string;
    searchResults: ReadonlyArray<unknown>;
    summary: string;
    insights: string[];
    sources: string[];
  };
}

export type ResearchResponse = ResearchSuccessResponse | ResearchErrorResponse;

export function createResearchRouter(researchService: ResearchService): Hono {
  const router = new Hono();

  router.post("/", async (c) => {
    try {
      const data = await c.req.json();
      const result = researchRequestSchema.safeParse(data);

      if (!result.success) {
        const errorResponse: ResearchErrorResponse = {
          status: "error",
          message: "Validation error",
          error: result.error.format(),
        };
        return c.json(errorResponse, 400);
      }

      const request = result.data as McpRequest;
      const researchResult = await researchService.research(request);

      return researchResult.match(
        (response) => {
          const successResponse: ResearchSuccessResponse = {
            status: "success",
            result: response,
          };
          return c.json(successResponse);
        },
        (error) => {
          const status = error.type === "validation" ? 400 : 500;
          const errorResponse: ResearchErrorResponse = {
            status: "error",
            message: error.message,
            type: error.type,
            result: {
              query: request.query,
              searchResults: [],
              summary: "",
              insights: [],
              sources: [],
            },
          };
          return c.json(errorResponse, status);
        },
      );
    } catch (error) {
      const errorResponse: ResearchErrorResponse = {
        status: "error",
        message: "Request parsing error",
        error: error instanceof Error ? error.message : "Unknown error",
        result: {
          query: "",
          searchResults: [],
          summary: "",
          insights: [],
          sources: [],
        },
      };
      return c.json(errorResponse, 400);
    }
  });

  return router;
}
