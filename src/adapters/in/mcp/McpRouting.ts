import { Hono } from "hono";
import { appDI, DIError } from "../../../config/AppDI.ts";
import { err, ok, Result } from "neverthrow";

/**
 * Factory function to create MCP routes
 */
export function createMcpRouter(): Result<Hono, DIError> {
  if (!appDI.isInitialized()) {
    return err({
      type: "not_initialized",
      message: "DI container not initialized. Call initialize() first.",
    });
  }

  const controllerResult = appDI.getMcpController();
  if (controllerResult.isErr()) {
    return err(controllerResult.error);
  }

  return ok(controllerResult.value.createRouter());
}
