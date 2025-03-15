/**
 * Type for Claude's structured analysis response data
 */
export interface ClaudeResponseType {
  summary: string;
  insights: string[];
  sources: string[];
}
