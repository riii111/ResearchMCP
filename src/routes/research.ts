import { Hono } from "hono";
import { z } from "zod";
import { ResearchService } from "../services/researchService.ts";
import { McpRequest } from "../models/mcp.ts";
import { err, ok } from "neverthrow";
import { getErrorStatusCode } from "../utils/errors.ts";
import {
  createResearchErrorResponse,
  ResearchParseError,
  ResearchSuccessResponse,
  ResearchValidationError,
} from "../models/research.ts";

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

export function createResearchRouter(researchService: ResearchService): Hono {
  const router = new Hono();

  router.post("/", async (c) => {
    const jsonResult = await c.req.json()
      .then((data) => ok(data))
      .catch((error) =>
        err<McpRequest, ResearchParseError>({
          type: "parse",
          message: error instanceof Error ? error.message : "Unknown error",
        })
      );

    if (jsonResult.isErr()) {
      return c.json(
        createResearchErrorResponse(
          "Request parsing error",
          jsonResult.error.message,
          jsonResult.error.type,
        ),
        { status: getErrorStatusCode(jsonResult.error) },
      );
    }

    const validationResult = researchRequestSchema.safeParse(jsonResult.value);
    if (!validationResult.success) {
      const validationError: ResearchValidationError = {
        type: "validation",
        message: "Validation error",
      };

      return c.json(
        createResearchErrorResponse(
          "Validation error",
          validationResult.error.format(),
          validationError.type,
        ),
        { status: getErrorStatusCode(validationError) },
      );
    }

    const request = validationResult.data as McpRequest;
    const researchResult = await researchService.research(request);

    return researchResult.match<Response>(
      (result) => {
        const successResponse: ResearchSuccessResponse = {
          status: "success",
          result,
        };
        return c.json(successResponse);
      },
      (error) => {
        const statusCode = getErrorStatusCode(error);
        const errorResponse = createResearchErrorResponse(
          error.message,
          undefined,
          error.type,
          { query: request.query },
        );

        return c.json(errorResponse, { status: statusCode });
      },
    );
  });

  return router;
}
