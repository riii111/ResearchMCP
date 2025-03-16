#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * ResearchMCP Command Line Interface
 *
 * A script that can launch an MCP server via standard I/O.
 * Available for use from MCP clients such as Claude Desktop.
 */

import { BraveSearchAdapter } from "./src/adapters/braveSearchAdapter.ts";
import { MemoryCacheAdapter } from "./src/adapters/memoryCache.ts";
import { SearchService } from "./src/services/searchService.ts";
import { createMcpServer, startMcpStdioServer } from "./src/services/mcpService.ts";

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
  const searchAdapter = new BraveSearchAdapter(braveApiKey, cacheAdapter);
  const searchService = new SearchService(searchAdapter);

  // Create and start MCP server
  const mcpServer = createMcpServer(searchService);

  console.error("Starting ResearchMCP server...");
  await startMcpStdioServer(mcpServer);
} catch (error) {
  console.error(`Fatal error: ${error}`);
  Deno.exit(1);
}
