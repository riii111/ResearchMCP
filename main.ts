/// <reference lib="deno.ns" />
import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { BraveSearchAdapter } from "./src/adapters/braveSearchAdapter.ts";
import { AnthropicClaudeAdapter } from "./src/adapters/claudeAdapter.ts";
import { MemoryCacheAdapter } from "./src/adapters/memoryCache.ts";
import { SearchService } from "./src/services/searchService.ts";
import { ResearchService } from "./src/services/researchService.ts";
import { createMcpRouter } from "./src/routes/mcp.ts";
import { createResearchRouter } from "./src/routes/research.ts";

const app = new Hono();
const port = parseInt(Deno.env.get("PORT") || "8088");
const braveApiKey = Deno.env.get("BRAVE_API_KEY");
const claudeApiKey = Deno.env.get("CLAUDE_API_KEY");

if (!braveApiKey) {
  console.error("Environment variable BRAVE_API_KEY is not set");
  Deno.exit(1);
}

app.use(logger());
app.use(secureHeaders());

// Setup adapters
const cacheAdapter = new MemoryCacheAdapter();
const searchAdapter = new BraveSearchAdapter(braveApiKey, cacheAdapter);
const searchService = new SearchService(searchAdapter);

// Setup endpoints
app.get("/", (c) => {
  return c.json({
    name: "ResearchMCP",
    status: "running",
    version: "0.1.0",
  });
});

app.route("/mcp", createMcpRouter(searchService));

// Setup Claude API integration if API key is available
if (claudeApiKey) {
  const claudeAdapter = new AnthropicClaudeAdapter(claudeApiKey);
  const researchService = new ResearchService(searchService, claudeAdapter);
  app.route("/research", createResearchRouter(researchService));
  console.log("Claude API integration enabled");
} else {
  console.log("Claude API integration disabled (no API key)");
}

// Error handlers
app.notFound((c) => {
  return c.json({ message: "Not Found" }, 404);
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ message: "Internal Server Error" }, 500);
});

console.log(`Server running on http://localhost:${port}`);

// @ts-ignore: Type definition mismatch in Deno.serve API
Deno.serve({ port }, app.fetch);
