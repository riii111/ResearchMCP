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
  readonly adapter?: string;
}

export type McpResponse = McpSuccessResponse | McpErrorResponse;

export interface McpSuccessResponse {
  readonly results: ReadonlyArray<McpResult>;
  readonly status: "success";
  readonly message?: string;
  readonly source?: string;
}

export interface McpErrorResponse {
  readonly results: ReadonlyArray<McpResult>;
  readonly status: "error";
  readonly message: string;
  readonly error?: string;
}

export interface McpResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly published?: string;
  readonly source?: string;
}

export type McpError =
  | { type: "validation"; message: string }
  | { type: "search"; details: string }
  | { type: "server"; message: string };
