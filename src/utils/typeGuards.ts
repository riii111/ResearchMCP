import { McpResult } from "../models/mcp.ts";
import { ClaudeResponseType } from "../models/claude.ts";

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

/**
 * Type guard for Claude API response
 */
export function isValidClaudeResponse(
  resp: unknown,
): resp is { content: Array<{ text: string }> } {
  return (
    typeof resp === "object" &&
    resp !== null &&
    "content" in resp &&
    Array.isArray((resp as { content: unknown }).content) &&
    (resp as { content: Array<unknown> }).content.length > 0 &&
    typeof ((resp as { content: Array<{ text?: unknown }> }).content[0].text) === "string"
  );
}

/**
 * Type guard for ClaudeResponseType
 */
export function isClaudeResponseType(data: unknown): data is ClaudeResponseType {
  return (
    typeof data === "object" &&
    data !== null &&
    "summary" in data && typeof (data as { summary: unknown }).summary === "string" &&
    "insights" in data && Array.isArray((data as { insights: unknown }).insights) &&
    "sources" in data && Array.isArray((data as { sources: unknown }).sources)
  );
}
