import { DomainError, DomainErrorType } from "./errors.ts";

export interface ApiErrorResponse<D = unknown, T = unknown> {
  status: "error";
  message: string;
  error?: T;
  data?: D;
}

export interface McpRequest {
  readonly query: string;
  readonly context?: ReadonlyArray<string>;
  readonly options?: McpOptions;
}

export interface McpOptions {
  readonly maxResults?: number;
  readonly country?: string;
  readonly language?: string;
  readonly freshness?: "day" | "week" | "month";
  readonly parallel?: boolean;
}

export type McpResponse = McpSuccessResponse | McpErrorResponse;

export interface McpSuccessResponse {
  readonly results: ReadonlyArray<McpResult>;
  readonly status: "success";
  readonly message?: string;
  readonly source?: string;
}

export interface McpErrorResponse extends ApiErrorResponse<ReadonlyArray<McpResult>> {
  readonly results: ReadonlyArray<McpResult>;
}

export interface McpResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly published?: string;
  readonly source?: string;
}

export type McpErrorType = Extract<DomainErrorType, "validation" | "search" | "server"> | "parse";

export interface McpError extends DomainError {
  type: McpErrorType;
}

export type McpValidationError = McpError & { type: "validation"; message: string };
export type McpSearchError = McpError & { type: "search"; details: string };
export type McpServerError = McpError & { type: "server"; message: string };
export type McpParseError = McpError & { type: "parse"; message: string };

export function createMcpErrorResponse(
  message: string,
  error?: unknown,
  results: ReadonlyArray<McpResult> = [],
): McpErrorResponse {
  return {
    status: "error",
    message,
    error,
    data: results,
    results,
  };
}
