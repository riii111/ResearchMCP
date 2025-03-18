/// <reference lib="deno.ns" />
/// <reference types="npm:neverthrow@6.1.0" />
/// <reference types="npm:zod@3.22.4" />
import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { getServerPort, loadApiKeys } from "./src/config/env.ts";
import { initializeAdapters } from "./src/config/adapters.ts";
import { DependencyInjection } from "./src/config/DependencyInjection.ts";
import { ApiError, createErrorResponse } from "./src/adapters/in/http/errors.ts";

/**
 * Main entry point for the HTTP server
 */
async function main() {
  // Load configuration
  const apiKeys = loadApiKeys();
  const port = getServerPort();

  // Initialize adapters and dependency injection
  const adapterContainer = initializeAdapters(apiKeys);
  const di = DependencyInjection.fromAdapterContainer(adapterContainer);

  // Create Hono app
  const app = new Hono();
  app.use(logger());
  app.use(secureHeaders());

  // Root endpoint
  app.get("/", (c) => {
    return c.json({
      name: "ResearchMCP",
      status: "running",
      version: "0.3.0", // Updated version for hexagonal architecture
    });
  });

  // Register MCP routes
  app.route("/mcp", di.getMcpRouter());

  // Error handling
  app.notFound((c) => {
    return c.json(createErrorResponse("Not Found"), { status: 404 });
  });

  app.onError((err, c) => {
    console.error(`Error: ${err}`);

    if (err instanceof ApiError) {
      return c.json(
        createErrorResponse(err.message, err.details),
        { status: err.status },
      );
    }

    const message = err instanceof Error ? err.message : "Internal Server Error";
    return c.json(
      createErrorResponse(message),
      { status: 500 },
    );
  });

  console.log(`Server running on http://localhost:${port}`);

  // @ts-ignore: Type definition mismatch in Deno.serve API
  await Deno.serve({ port }, app.fetch);
}

// Start the server
main().catch((error) => {
  console.error("Fatal error:", error);
  Deno.exit(1);
});
