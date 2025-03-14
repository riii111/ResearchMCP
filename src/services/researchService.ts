import { err, ok, Result } from "neverthrow";
import { SearchService } from "./searchService.ts";
import { ClaudeAdapter, ClaudeMessage } from "../adapters/claudeAdapter.ts";
import { McpError, McpRequest, McpResult } from "../models/mcp.ts";

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
      return err({
        type: "search_failed",
        message: `Failed to retrieve search results: ${JSON.stringify(searchResult.error)}`,
      });
    }

    // Use destructuring instead of _unsafeUnwrap()
    const { value: searchData } = searchResult;
    if (searchData.results.length === 0) {
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
      Array.from(searchData.results),
    );

    return analysisResult.match<Result<ResearchResult, ResearchError>>(
      (analysis) => {
        // Format the response using match pattern
        return ok({
          query: request.query,
          searchResults: searchData.results,
          summary: analysis.summary,
          insights: analysis.insights,
          sources: analysis.sources,
        });
      },
      (error) => {
        return err({
          type: "analysis_failed",
          message: `Failed to analyze search results: ${JSON.stringify(error)}`,
        });
      },
    );
  }

  private async analyzeWithClaude(
    query: string,
    results: McpResult[],
  ): Promise<
    Result<{
      summary: string;
      insights: string[];
      sources: string[];
    }, McpError>
  > {
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

    return response.match<
      Result<{
        summary: string;
        insights: string[];
        sources: string[];
      }, McpError>
    >(
      (claudeResponse) => {
        try {
          const content = claudeResponse.content[0].text;
          const analysisData = JSON.parse(content) as {
            summary: string;
            insights: string[];
            sources: string[];
          };

          return ok(analysisData);
        } catch (error) {
          return err({
            type: "server",
            message: `Failed to parse Claude response: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          });
        }
      },
      (error) => {
        return err({
          type: "server",
          message: `Claude API error: ${JSON.stringify(error)}`,
        });
      },
    );
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
