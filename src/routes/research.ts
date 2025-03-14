import { Hono } from "hono";
import { z } from "zod";
import { ResearchService } from "../services/researchService.ts";
import { McpRequest } from "../models/mcp.ts";
import { getErrorSafe, getValueSafe } from "../utils/resultUtils.ts";

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

      if (researchResult.isOk()) {
        const resultValue = getValueSafe(researchResult);
        const successResponse: ResearchSuccessResponse = {
          status: "success",
          result: resultValue!,
        };
        return c.json(successResponse);
      } else {
        const error = getErrorSafe(researchResult);
        if (!error) {
          return c.json({ status: "error", message: "Unknown error" }, 500);
        }

        // Type assertion to ensure error is properly typed
        const typedError = error as { type: string; message: string };
        const status = typedError.type === "validation" ? 400 : 500;
        const errorResponse: ResearchErrorResponse = {
          status: "error",
          message: typedError.message,
          type: typedError.type,
          result: {
            query: request.query,
            searchResults: [],
            summary: "",
            insights: [],
            sources: [],
          },
        };
        return c.json(errorResponse, status);
      }
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
