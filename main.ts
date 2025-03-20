/// <reference lib="deno.ns" />
/// <reference types="npm:neverthrow@6.1.0" />
/// <reference types="npm:zod@3.22.4" />
import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { getServerPort, loadApiKeys } from "./src/config/env.ts";
import { initializeAdapters } from "./src/config/adapters.ts";
import { appDI } from "./src/config/AppDI.ts";
import { ApiError, createErrorResponse } from "./src/adapters/in/http/errors.ts";
import { error, info } from "./src/config/logger.ts";

/**
 * Main entry point for the HTTP server
 */
async function main() {
  const apiKeys = loadApiKeys();
  const port = getServerPort();

  const adapterResult = initializeAdapters(apiKeys);
  if (adapterResult.isErr()) {
    error(`Failed to initialize adapters: ${adapterResult.error.message}`);
    Deno.exit(1);
  }

  const adapterContainer = adapterResult.value;
  const diResult = appDI.initialize(adapterContainer);

  if (diResult.isErr()) {
    error(`Failed to initialize DI container: ${diResult.error.message}`);
    Deno.exit(1);
  }

  const routerResult = appDI.getMcpRouter();
  if (routerResult.isErr()) {
    error(`Failed to get MCP router: ${routerResult.error.message}`);
    Deno.exit(1);
  }

  const app = new Hono();
  app.use(logger());
  app.use(secureHeaders());

  app.get("/", (c) => {
    return c.json({
      name: "ResearchMCP",
      status: "running",
      version: "0.3.0",
    });
  });

  app.route("/mcp", routerResult.value);

  app.notFound((c) => {
    return c.json(createErrorResponse("Not Found"), { status: 404 });
  });

  app.onError((err, c) => {
    error(`Error: ${err}`);

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

  info(`Server running on http://localhost:${port}`);

  await Deno.serve({ port }, app.fetch);
}

main().catch((err) => {
  error(`Fatal error: ${err}`);
  Deno.exit(1);
});
