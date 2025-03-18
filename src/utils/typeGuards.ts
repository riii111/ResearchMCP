import { McpResult } from "../models/mcp.ts";

/**
 * Type guard to check if the response is a success response with results
 */
export function isSuccessResponseWithResults(
  data: unknown,
): data is { results: ReadonlyArray<McpResult> } {
  return (
    typeof data === "object" &&
    data !== null &&
    "results" in data &&
    Array.isArray((data as { results: unknown }).results)
  );
}
