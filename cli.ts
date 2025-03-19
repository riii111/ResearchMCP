#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * ResearchMCP Command Line Interface
 *
 * A script that can launch an MCP server via standard I/O.
 * Available for use from MCP clients such as Claude Desktop.
 */

import { loadApiKeys } from "./src/config/env.ts";
import { initializeAdapters } from "./src/config/adapters.ts";
import { AppDI } from "./src/config/DependencyInjection.ts";
import { err, fromThrowable, ok, Result, ResultAsync } from "neverthrow";

const encoder = new TextEncoder();
const logToStderr = (message: string) => {
  Deno.stderr.writeSync(encoder.encode(message + "\n"));
};

type SetupError = {
  type: "setup";
  message: string;
};

type ServerError = {
  type: "server";
  message: string;
};

type CliError = SetupError | ServerError;

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
  const initAdaptersResult = fromThrowable(
    () => initializeAdapters(apiKeys),
    (error): CliError => ({
      type: "setup",
      message: `Failed to initialize adapters: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }),
  )();

  if (initAdaptersResult.isErr()) {
    return err(initAdaptersResult.error);
  }

  // Create dependency injection container
  const adapterContainer = initAdaptersResult.value;
  const di = AppDI.initialize(adapterContainer);

  return ok(di);
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
        di.startMcpServer().then((result) =>
          result.match(
            () => undefined,
            (e) => {
              throw e;
            },
          )
        ),
        (error) => ({
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
          message: `Error from setup: ${error.message}`,
        }),
      ),
  );
}

// Start the server
startServer()
  .then((result) => {
    result.match(
      () => {
        // Do nothing on normal termination
      },
      (error) => {
        logToStderr(`Fatal error: ${error.message}`);
        Deno.exit(1);
      },
    );
  });
