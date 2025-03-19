#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * ResearchMCP Command Line Interface
 *
 * A script that can launch an MCP server via standard I/O.
 * Available for use from MCP clients such as Claude Desktop.
 */

import { loadApiKeys } from "./src/config/env.ts";
import { initializeAdapters } from "./src/config/adapters.ts";
import { AppDI, DIError } from "./src/config/DependencyInjection.ts";
import { err, fromThrowable, ok, Result, ResultAsync } from "neverthrow";

const encoder = new TextEncoder();
const logToStderr = (message: string) => {
  Deno.stderr.writeSync(encoder.encode(message + "\n"));
};

// 複合エラー型
type CliError =
  | { type: "setup"; message: string }
  | { type: "server"; message: string }
  | { type: "di"; error: DIError };

/**
 * Setup the dependency injection container
 */
function setupDependencyInjection(): Result<AppDI, CliError> {
  // Load API keys
  const loadApiKeysResult = fromThrowable(
    loadApiKeys,
    (error): CliError => ({
      type: "setup",
      message: `Failed to load API keys: ${error instanceof Error ? error.message : String(error)}`,
    }),
  )();

  if (loadApiKeysResult.isErr()) {
    return err(loadApiKeysResult.error);
  }

  const apiKeys = loadApiKeysResult.value;

  // Initialize adapters
  const initAdaptersResult = initializeAdapters(apiKeys);
  if (initAdaptersResult.isErr()) {
    return err({
      type: "setup",
      message: `Failed to initialize adapters: ${initAdaptersResult.error.message}`,
    });
  }

  // Create dependency injection container
  const adapterContainer = initAdaptersResult.value;
  const diResult = AppDI.initialize(adapterContainer);

  if (diResult.isErr()) {
    return err({
      type: "di",
      error: diResult.error,
    });
  }

  return ok(diResult.value);
}

/**
 * Start the MCP server
 */
function startServer(): ResultAsync<void, CliError> {
  const diResult = setupDependencyInjection();

  return diResult.match(
    (di) => {
      logToStderr("Starting ResearchMCP server...");
      logToStderr("Server capabilities:");
      logToStderr("- search tool: enabled");
      logToStderr("- resources: minimal implementation");
      logToStderr("- prompts: minimal implementation");

      return ResultAsync.fromPromise(
        di.startMcpServer().then((result) => {
          if (result.isErr()) {
            const error = result.error;
            if (error instanceof Error) {
              return Promise.reject({
                type: "server",
                message: `Server error: ${error.message}`,
              });
            } else {
              return Promise.reject({
                type: "di",
                message: `DI error: ${error.type} - ${error.message}`,
              });
            }
          }
          return Promise.resolve(undefined);
        }),
        (error): CliError => ({
          type: "server",
          message: `Server error: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    },
    (error) =>
      ResultAsync.fromPromise(
        Promise.resolve(undefined),
        () => ({
          type: "server",
          message: `Error from setup: ${getErrorMessage(error)}`,
        }),
      ),
  );
}

// エラーメッセージを取得する関数
function getErrorMessage(error: CliError): string {
  switch (error.type) {
    case "setup":
    case "server":
      return error.message;
    case "di":
      return `DI error: ${error.error.type} - ${error.error.message}`;
  }
}

// Start the server
startServer()
  .then((result) => {
    result.match(
      () => {
        // Do nothing on normal termination
      },
      (error) => {
        logToStderr(`Fatal error: ${getErrorMessage(error)}`);
        Deno.exit(1);
      },
    );
  });
