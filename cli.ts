#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * ResearchMCP Command Line Interface
 *
 * A script that can launch an MCP server via standard I/O.
 * Available for use from MCP clients such as Claude Desktop.
 */

import { BraveSearchAdapter } from "./src/adapters/search/braveSearchAdapter.ts";
import { MemoryCacheAdapter } from "./src/adapters/cache/memoryCache.ts";
import { SearchService } from "./src/services/searchService.ts";
import { RoutingService } from "./src/services/routingService.ts";
import { createMcpServer, startMcpStdioServer } from "./src/services/mcpService.ts";
import { QueryClassifierService } from "./src/services/queryClassifierService.ts";

// Check environment variables
const braveApiKey = Deno.env.get("BRAVE_API_KEY");

if (!braveApiKey) {
  console.error("Error: BRAVE_API_KEY environment variable is not set");
  console.error("Please set the BRAVE_API_KEY environment variable and try again");
  Deno.exit(1);
}

try {
  // Setup adapters and services
  const cacheAdapter = new MemoryCacheAdapter();
  // Register the search adapter
  const _searchAdapter = new BraveSearchAdapter(braveApiKey, cacheAdapter);
  const queryClassifier = new QueryClassifierService();
  const routingService = new RoutingService(queryClassifier);
  const searchService = new SearchService(routingService);

  // Create and start MCP server
  const mcpServer = createMcpServer(searchService);

  console.error("Starting ResearchMCP server...");
  console.error("Server capabilities:");
  console.error("- search tool: enabled");
  console.error("- resources: minimal implementation");
  console.error("- prompts: minimal implementation");
  await startMcpStdioServer(mcpServer);
} catch (error) {
  console.error(`Fatal error: ${error}`);
  Deno.exit(1);
}
