/// <reference lib="deno.ns" />
/// <reference types="npm:neverthrow@6.1.0" />
/// <reference types="npm:zod@3.22.4" />
import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { getServerPort, loadApiKeys } from "./src/setup/env.ts";
import { initializeAdapters } from "./src/setup/adapters.ts";
import { QueryClassifierService } from "./src/services/queryClassifierService.ts";
import { RoutingService } from "./src/services/routingService.ts";
import { SearchService } from "./src/services/searchService.ts";
import { ResearchService } from "./src/services/researchService.ts";
import { createMcpRouter } from "./src/routes/mcp.ts";
import { createResearchRouter } from "./src/routes/research.ts";
import { ApiError, createErrorResponse } from "./src/utils/errors.ts";

const apiKeys = loadApiKeys();
const port = getServerPort();

const app = new Hono();
app.use(logger());
app.use(secureHeaders());

const adapters = initializeAdapters(apiKeys);

const queryClassifier = new QueryClassifierService();
const routingService = new RoutingService(queryClassifier);
const searchService = new SearchService(routingService);

app.get("/", (c) => {
  return c.json({
    name: "ResearchMCP",
    status: "running",
    version: "0.2.0",
  });
});

app.route("/mcp", createMcpRouter(searchService));

if (adapters.claude) {
  const researchService = new ResearchService(searchService, adapters.claude);
  app.route("/research", createResearchRouter(researchService));
}

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

  // Unhandled error
  const message = err instanceof Error ? err.message : "Internal Server Error";
  return c.json(
    createErrorResponse(message),
    { status: 500 },
  );
});

console.log(`Server running on http://localhost:${port}`);

// @ts-ignore: Type definition mismatch in Deno.serve API
Deno.serve({ port }, app.fetch);
