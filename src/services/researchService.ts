import { err, ok, Result } from "neverthrow";
import { SearchService } from "./searchService.ts";
import { ClaudeAdapter, ClaudeMessage } from "../adapters/claude/claudeAdapter.ts";
import { McpError, McpRequest, McpResult, McpServerError } from "../models/mcp.ts";
import { ClaudeResponseType } from "../models/claude.ts";
import { getErrorSafe, getValueSafe } from "../utils/resultUtils.ts";
import {
  isClaudeResponseType,
  isSuccessResponseWithResults,
  isValidClaudeResponse,
} from "../utils/typeGuards.ts";

export interface ResearchResult {
  query: string;
  searchResults: ReadonlyArray<McpResult>;
  summary: string;
  insights: string[];
  sources: string[];
}

export type ResearchError =
  | { type: "search_failed"; message: string }
  | { type: "analysis_failed"; message: string }
  | { type: "validation"; message: string };

export class ResearchService {
  constructor(
    private readonly searchService: SearchService,
    private readonly claudeAdapter: ClaudeAdapter,
  ) {}

  async research(request: McpRequest): Promise<Result<ResearchResult, ResearchError>> {
    if (!request.query) {
      return err({
        type: "validation",
        message: "Search query is required",
      });
    }

    // Step 1: Perform the search
    const searchResult = await this.searchService.searchMcp(request);

    if (searchResult.isErr()) {
      const errorValue = getErrorSafe(searchResult);
      return err({
        type: "search_failed",
        message: `Failed to retrieve search results: ${JSON.stringify(errorValue)}`,
      });
    }

    const { value: searchData } = searchResult;

    const successData = isSuccessResponseWithResults(searchData)
      ? searchData
      : { results: [] as ReadonlyArray<McpResult> };

    if (successData.results.length === 0) {
      return ok({
        query: request.query,
        searchResults: [],
        summary: "No search results found.",
        insights: [],
        sources: [],
      });
    }

    // Step 2: Ask Claude to analyze the search results
    const analysisResult = await this.analyzeWithClaude(
      request.query,
      Array.from(successData.results),
    );

    if (analysisResult.isErr()) {
      const errorValue = getErrorSafe(analysisResult);
      return err({
        type: "analysis_failed",
        message: `Failed to analyze search results: ${JSON.stringify(errorValue)}`,
      });
    }

    const analysis = getValueSafe(analysisResult);
    if (!analysis) {
      return err({
        type: "analysis_failed",
        message: "Failed to get analysis result",
      });
    }

    if (!isClaudeResponseType(analysis)) {
      return err({
        type: "analysis_failed",
        message: "Analysis result does not match expected format",
      });
    }

    const typedAnalysis = analysis as ClaudeResponseType;

    return ok({
      query: request.query,
      searchResults: successData.results,
      summary: typedAnalysis.summary,
      insights: typedAnalysis.insights,
      sources: typedAnalysis.sources,
    });
  }

  private async analyzeWithClaude(
    query: string,
    results: McpResult[],
  ): Promise<Result<ClaudeResponseType, McpError>> {
    const promptMessages: ClaudeMessage[] = [
      {
        role: "user",
        content: this.buildAnalysisPrompt(query, results),
      },
    ];

    const claudeRequest = {
      model: "claude-3-sonnet-20240229",
      messages: promptMessages,
      temperature: 0.3,
      max_tokens: 1500,
      system:
        "You are a helpful research assistant that summarizes search results and extracts insights.",
    };

    const response = await this.claudeAdapter.complete(claudeRequest);

    if (response.isErr()) {
      const errorValue = getErrorSafe(response);
      return err({
        type: "server",
        message: `Claude API error: ${JSON.stringify(errorValue)}`,
      });
    }

    const claudeResponse = getValueSafe(response);
    if (!claudeResponse) {
      return err({
        type: "server",
        message: "Failed to get Claude response",
      });
    }

    if (!isValidClaudeResponse(claudeResponse)) {
      return err({
        type: "server",
        message: "Invalid Claude response format",
      });
    }

    const content = claudeResponse.content[0].text;

    return this.parseJsonContent(content);
  }

  private parseJsonContent(content: string): Result<ClaudeResponseType, McpError> {
    return this.safeJsonParse(content).andThen((parsedData) => {
      if (!isClaudeResponseType(parsedData)) {
        const serverError: McpServerError = {
          type: "server",
          message: "Claude response does not match expected format",
          details: undefined,
        };
        return err(serverError);
      }
      return ok(parsedData);
    });
  }

  private safeJsonParse(text: string): Result<unknown, McpError> {
    const serverError: McpServerError = {
      type: "server",
      message: "Failed to parse JSON from Claude response",
      details: undefined,
    };

    const parseJSON = Result.fromThrowable(
      JSON.parse,
      () => serverError,
    );

    return parseJSON(text);
  }

  private buildAnalysisPrompt(query: string, results: ReadonlyArray<McpResult>): string {
    const resultsText = results
      .map((result, index) => {
        return `[${index + 1}] ${result.title}
URL: ${result.url}
Snippet: ${result.snippet}
${result.published ? `Published: ${result.published}` : ""}
`;
      })
      .join("\n\n");

    return `I need you to analyze these search results for the query: "${query}"

${resultsText}

Analyze these search results and provide a response in this JSON format:
{
  "summary": "A concise 1-3 paragraph summary of the most relevant information across all sources",
  "insights": ["Key insight 1", "Key insight 2", "Key insight 3"], 
  "sources": ["Source 1", "Source 2", "Source 3"]
}

The summary should highlight the most important and credible information related to the query.
The insights should be specific, factual points extracted from the search results.
The sources should list the most relevant and authoritative sources by their number [1], [2], etc.

IMPORTANT: Your response must be valid JSON and nothing else.`;
  }
}
