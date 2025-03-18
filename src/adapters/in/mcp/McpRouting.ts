import { Hono } from "hono";
import { SearchUseCase } from "../../../application/ports/in/SearchUseCase.ts";
import { McpController } from "./McpController.ts";

/**
 * Factory function to create MCP routes
 */
export function createMcpRouter(searchUseCase: SearchUseCase): Hono {
  const mcpController = new McpController(searchUseCase);
  return mcpController.createRouter();
}
