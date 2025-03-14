import { Hono } from "hono";
import { createMcpRouter } from "./src/routes/mcp.ts";

const app = new Hono();
const port = parseInt(Deno.env.get("PORT") || "8000");
const braveApiKey = Deno.env.get("BRAVE_API_KEY");

if (!braveApiKey) {
  console.error("環境変数BRAVE_API_KEYが設定されていません");
  Deno.exit(1);
}


app.get("/", (c) => {
  return c.json({
    name: "ResearchMCP",
    status: "running",
    version: "0.1.0",
  });
});

app.notFound((c) => {
  return c.json({ message: "Not Found" }, 404);
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ message: "Internal Server Error" }, 500);
});

console.log(`Server running on http://localhost:${port}`);

Deno.serve({ port }, app.fetch);