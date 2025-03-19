import { Hono } from "hono";
import { AppDI, DIError } from "../../../config/DependencyInjection.ts";
import { err, ok, Result } from "neverthrow";

/**
 * Factory function to create MCP routes
 */
export function createMcpRouter(): Result<Hono, DIError> {
  const diResult = AppDI.getInstance();
  if (diResult.isErr()) {
    return err(diResult.error);
  }

  const di = diResult.value;
  const controllerResult = di.getMcpController();
  if (controllerResult.isErr()) {
    return err(controllerResult.error);
  }

  return ok(controllerResult.value.createRouter());
}
