/// <reference lib="deno.ns" />
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import { SearchService } from "./searchService.ts";
import { McpResult } from "../models/mcp.ts";
import { err, ok, Result } from "neverthrow";

/**
 * Creates and configures an MCP (Model Context Protocol) server with search capabilities
 * @param searchService The search service to handle queries
 * @returns MCP server instance
 */
export function createMcpServer(searchService: SearchService): McpServer {
  const server = new McpServer({
    name: "ResearchMCP",
    version: "0.1.0",
    capabilities: {
      resources: {}, // Enable resources capability
      prompts: {}, // Enable prompts capability
    },
  });

  // Register an empty prompt to support prompts/list method
  server.prompt(
    "empty-prompt",
    "Empty placeholder prompt for MCP protocol compliance",
    {}, // Empty args schema
    (_args) => ({
      messages: [{
        role: "assistant", // Using "assistant" as per MCP protocol requirements
        content: {
          type: "text",
          text: "Empty prompt for MCP protocol compliance",
        },
      }],
    }),
  );

  server.resource(
    "empty-resource",
    "empty://resource",
    () => ({
      contents: [],
    }),
  );

  server.tool(
    "search",
    "Search the web for information",
    z.object({
      query: z.string().min(1).max(200),
      context: z.array(z.string()).optional(),
      maxResults: z.number().int().min(1).max(50).optional(),
      country: z.string().length(2).optional(),
      language: z.string().min(2).max(5).optional(),
      freshness: z.enum(["day", "week", "month"]).optional(),
      parallel: z.boolean().optional(),
    }).shape,
    async (params, _extra) => {
      Deno.stderr.writeSync(new TextEncoder().encode(`MCP search request: ${params.query}\n`));

      const searchResult = await searchService.searchMcp({
        query: params.query,
        context: params.context,
        options: {
          maxResults: params.maxResults,
          country: params.country,
          language: params.language,
          freshness: params.freshness,
          parallel: params.parallel,
        },
      });

      return searchResult.match(
        (response) => {
          return {
            content: [
              {
                type: "text",
                text: formatSearchResults(response.results),
              },
            ],
          };
        },
        (error) => {
          Deno.stderr.writeSync(
            new TextEncoder().encode(`Search error: ${JSON.stringify(error)}\n`),
          );
          let errorMessage = "";

          switch (error.type) {
            case "validation":
              errorMessage = `Validation error: ${error.message}`;
              break;
            case "search":
              errorMessage = `Search error: ${error.details}`;
              break;
            case "server":
              errorMessage = `Server error: ${error.message}`;
              break;
            default:
              errorMessage = `Error: ${error.message || "Unknown error"}`;
          }

          return {
            content: [
              {
                type: "text",
                text: errorMessage,
              },
            ],
            isError: true,
          };
        },
      );
    },
  );

  return server;
}

function formatSearchResults(results: ReadonlyArray<McpResult>): string {
  if (results.length === 0) {
    return "No results found.";
  }

  return results
    .map((result, index) => {
      const publishedDate = result.published
        ? `(${new Date(result.published).toLocaleDateString()})`
        : "";

      return `${index + 1}. ${result.title} ${publishedDate}
   URL: ${result.url}
   ${result.snippet}
`;
    })
    .join("\n");
}

/**
 * Starts an MCP server with stdio transport
 * @param server MCP server instance
 */
export async function startMcpStdioServer(server: McpServer): Promise<Result<void, Error>> {
  Deno.stderr.writeSync(
    new TextEncoder().encode("Starting MCP server with stdio transport...\n"),
  );

  const transport = new StdioServerTransport();

  // Connect to transport - all JSON-RPC messages will use stdout
  return await server.connect(transport)
    .then(() => {
      Deno.stderr.writeSync(new TextEncoder().encode("MCP server connected via stdio transport\n"));
      return ok(undefined);
    })
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      Deno.stderr.writeSync(
        new TextEncoder().encode(`Failed to start MCP server: ${errorMessage}\n`),
      );
      return err(error instanceof Error ? error : new Error(String(error)));
    });
}
