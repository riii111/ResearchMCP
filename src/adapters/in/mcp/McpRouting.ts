import { Hono } from "hono";
import { AppDI } from "../../../config/DependencyInjection.ts";

/**
 * Factory function to create MCP routes
 */
export function createMcpRouter(): Hono {
  const di = AppDI.getInstance();
  const controller = di.getMcpController();
  return controller.createRouter();
}
