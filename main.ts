import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { BraveSearchAdapter } from "./src/adapters/braveSearchAdapter.ts";
import { MemoryCacheAdapter } from "./src/adapters/memoryCache.ts";
import { SearchService } from "./src/services/searchService.ts";
import { createMcpRouter } from "./src/routes/mcp.ts";

const app = new Hono();
const port = parseInt(Deno.env.get("PORT") || "8000");
const braveApiKey = Deno.env.get("BRAVE_API_KEY");

if (!braveApiKey) {
  console.error("Environment variable BRAVE_API_KEY is not set");
  Deno.exit(1);
}

app.use(logger());
app.use(secureHeaders());

const cacheAdapter = new MemoryCacheAdapter();
const searchAdapter = new BraveSearchAdapter(braveApiKey, cacheAdapter);
const searchService = new SearchService(searchAdapter);

app.get("/", (c) => {
  return c.json({
    name: "ResearchMCP",
    status: "running",
    version: "0.1.0",
  });
});

app.route("/mcp", createMcpRouter(searchService));

app.notFound((c) => {
  return c.json({ message: "Not Found" }, 404);
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ message: "Internal Server Error" }, 500);
});

console.log(`Server running on http://localhost:${port}`);

Deno.serve({ port }, app.fetch);