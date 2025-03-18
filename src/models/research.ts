import { ApiErrorResponse, DomainErrorType } from "../utils/errors.ts";
import { McpResult } from "./mcp.ts";

export interface ResearchRequest {
  readonly query: string;
  readonly context?: ReadonlyArray<string>;
  readonly options?: ResearchOptions;
}

export interface ResearchOptions {
  readonly maxResults?: number;
  readonly country?: string;
  readonly language?: string;
  readonly freshness?: "day" | "week" | "month";
}

export interface ResearchSuccessResponse {
  readonly status: "success";
  readonly result: ResearchResult;
}

export interface ResearchResult {
  readonly query: string;
  readonly searchResults: ReadonlyArray<McpResult>;
  readonly summary: string;
  readonly insights: string[];
  readonly sources: string[];
}

export interface ResearchErrorResponse extends ApiErrorResponse<Partial<ResearchResult>> {
  readonly result?: Partial<ResearchResult>;
  readonly type?: string;
}

export type ResearchResponse = ResearchSuccessResponse | ResearchErrorResponse;

export type ResearchErrorType =
  | Extract<DomainErrorType, "validation" | "search" | "server">
  | "parse"
  | "analysis_failed";

export interface ResearchError {
  type: ResearchErrorType;
  message: string;
  details?: unknown;
}

export type ResearchValidationError = ResearchError & { type: "validation"; message: string };
export type ResearchSearchError = ResearchError & { type: "search"; message: string };
export type ResearchServerError = ResearchError & { type: "server"; message: string };
export type ResearchParseError = ResearchError & { type: "parse"; message: string };
export type ResearchAnalysisError = ResearchError & { type: "analysis_failed"; message: string };

export function createResearchErrorResponse(
  message: string,
  error?: unknown,
  type?: string,
  partialResult?: Partial<ResearchResult>,
): ResearchErrorResponse {
  const response: ResearchErrorResponse = {
    status: "error",
    message,
    type,
    data: partialResult,
    result: partialResult,
  };

  if (error) {
    response.error = error;
  }

  return response;
}
