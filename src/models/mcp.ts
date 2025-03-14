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
}

export interface McpResponse {
  readonly results: ReadonlyArray<McpResult>;
  readonly status: "success" | "error";
  readonly message?: string;
}

export interface McpResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly published?: string;
}

export type McpError =
  | { type: "validation"; message: string }
  | { type: "search"; details: string }
  | { type: "server"; message: string };