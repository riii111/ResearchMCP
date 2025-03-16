import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import { SearchService } from "./searchService.ts";
import { McpResult } from "../models/mcp.ts";

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
    {},
    () => ({
      messages: [{
        role: "system",
        content: [{
          type: "text",
          text: "Empty prompt for MCP protocol compliance",
        }],
      }],
    }),
  );

  // Register an empty resource to support resources/list method
  server.resource(
    "empty-resource",
    "empty://resource",
    async () => ({
      contents: [],
    }),
  );

  // Register search tool
  server.tool(
    "search",
    {
      query: z.string().min(1).max(200),
      context: z.array(z.string()).optional(),
      maxResults: z.number().int().min(1).max(50).optional(),
      country: z.string().length(2).optional(),
      language: z.string().min(2).max(5).optional(),
      freshness: z.enum(["day", "week", "month"]).optional(),
    },
    async ({ query, context, maxResults, country, language, freshness }) => {
      try {
        // Logging to stderr to avoid interfering with stdout JSON-RPC messages
        Deno.stderr.writeSync(new TextEncoder().encode(`MCP search request: ${query}\n`));

        const searchResult = await searchService.searchMcp({
          query,
          context,
          options: {
            maxResults,
            country,
            language,
            freshness,
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
            // Log errors to stderr
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
      } catch (error) {
        // Log unexpected errors to stderr
        Deno.stderr.writeSync(
          new TextEncoder().encode(`Unexpected error in MCP search: ${error}\n`),
        );
        return {
          content: [
            {
              type: "text",
              text: `An unexpected error occurred: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

/**
 * Formats search results into a human-readable text
 * @param results Array of search results
 * @returns Formatted text representation
 */
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
export async function startMcpStdioServer(server: McpServer): Promise<void> {
  try {
    // Log server startup info to stderr
    Deno.stderr.writeSync(
      new TextEncoder().encode("Starting MCP server with stdio transport...\n"),
    );
    const transport = new StdioServerTransport();

    // Connect to transport - all JSON-RPC messages will use stdout
    await server.connect(transport);

    Deno.stderr.writeSync(new TextEncoder().encode("MCP server connected via stdio transport\n"));
  } catch (error) {
    Deno.stderr.writeSync(new TextEncoder().encode(`Failed to start MCP server: ${error}\n`));
    throw error;
  }
}
