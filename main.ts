/// <reference lib="deno.ns" />
import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { AnthropicClaudeAdapter } from "./src/adapters/claude/claudeAdapter.ts";
import { MemoryCacheAdapter } from "./src/adapters/cache/memoryCache.ts";
import { registerBraveSearchAdapter } from "./src/adapters/search/braveSearchAdapter.ts";
import { registerTavilySearchAdapter } from "./src/adapters/search/tavilySearchAdapter.ts";
import { registerWikipediaAdapter } from "./src/adapters/search/wikipediaAdapter.ts";
import { registerGitHubAdapter } from "./src/adapters/search/githubAdapter.ts";
import { SearchService } from "./src/services/searchService.ts";
import { ResearchService } from "./src/services/researchService.ts";
import { QueryClassifierService } from "./src/services/queryClassifierService.ts";
import { RoutingService } from "./src/services/routingService.ts";
import { createMcpRouter } from "./src/routes/mcp.ts";
import { createResearchRouter } from "./src/routes/research.ts";

const app = new Hono();
const port = parseInt(Deno.env.get("PORT") || "8088");

// API Keys
const braveApiKey = Deno.env.get("BRAVE_API_KEY");
const tavilyApiKey = Deno.env.get("TAVILY_API_KEY");
const githubToken = Deno.env.get("GITHUB_API_TOKEN");
const claudeApiKey = Deno.env.get("CLAUDE_API_KEY");

if (!braveApiKey) {
  console.error("Environment variable BRAVE_API_KEY is not set");
  Deno.exit(1);
}

app.use(logger());
app.use(secureHeaders());

// Setup cache
const cacheAdapter = new MemoryCacheAdapter();

// Setup search adapters - register with registry
registerBraveSearchAdapter(braveApiKey, cacheAdapter);
console.log("Registered BraveSearchAdapter");

if (tavilyApiKey) {
  registerTavilySearchAdapter(tavilyApiKey, cacheAdapter);
  console.log("Registered TavilySearchAdapter");
} else {
  console.log("Tavily API integration disabled (no API key)");
}

// Register Wikipedia adapter (no API key required)
registerWikipediaAdapter(cacheAdapter);
console.log("Registered WikipediaAdapter");

// Register GitHub adapter if token is available
if (githubToken) {
  registerGitHubAdapter(githubToken, cacheAdapter);
  console.log("Registered GitHubAdapter");
} else {
  console.log("GitHub API integration disabled (no API token)");
}

// Setup services
const queryClassifier = new QueryClassifierService();
const routingService = new RoutingService(queryClassifier);
const searchService = new SearchService(routingService);

// Setup endpoints
app.get("/", (c) => {
  return c.json({
    name: "ResearchMCP",
    status: "running",
    version: "0.2.0",
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
