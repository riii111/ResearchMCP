#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * ResearchMCP Command Line Interface
 *
 * A script that can launch an MCP server via standard I/O.
 * Available for use from MCP clients such as Claude Desktop.
 */

import { loadApiKeys } from "./src/setup/env.ts";
import { initializeAdapters } from "./src/setup/adapters.ts";
import { SearchService } from "./src/services/searchService.ts";
import { RoutingService } from "./src/services/routingService.ts";
import { createMcpServer, startMcpStdioServer } from "./src/services/mcpService.ts";
import { QueryClassifierService } from "./src/services/queryClassifierService.ts";

// Load API keys from environment variables
const apiKeys = loadApiKeys();

const encoder = new TextEncoder();
const logToStderr = (message: string) => {
  Deno.stderr.writeSync(encoder.encode(message + "\n"));
};

try {
  // Initialize all available adapters
  initializeAdapters(apiKeys);

  const queryClassifier = new QueryClassifierService();
  const routingService = new RoutingService(queryClassifier);
  const searchService = new SearchService(routingService);

  // Create and start MCP server
  const mcpServer = createMcpServer(searchService);

  logToStderr("Starting ResearchMCP server...");
  logToStderr("Server capabilities:");
  logToStderr("- search tool: enabled");
  logToStderr("- resources: minimal implementation");
  logToStderr("- prompts: minimal implementation");
  await startMcpStdioServer(mcpServer);
} catch (error) {
  logToStderr(`Fatal error: ${error}`);
  Deno.exit(1);
}
