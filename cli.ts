#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * ResearchMCP Command Line Interface
 *
 * A script that can launch an MCP server via standard I/O.
 * Available for use from MCP clients such as Claude Desktop.
 */

import { loadApiKeys } from "./src/setup/env.ts";
import { initializeAdapters } from "./src/setup/adapters.ts";
import { SearchService } from "./src/services/searchService.ts";
import { RoutingService } from "./src/services/routingService.ts";
import { createMcpServer, startMcpStdioServer } from "./src/services/mcpService.ts";
import { QueryClassifierService } from "./src/services/queryClassifierService.ts";
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

function setupServices(): Result<SearchService, CliError> {
  const loadApiKeysResult = fromThrowable(
    loadApiKeys,
    (error): CliError => ({
      type: "setup",
      message: `Failed to setup services: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }),
  )();

  if (loadApiKeysResult.isErr()) {
    return err(loadApiKeysResult.error);
  }

  const apiKeys = loadApiKeysResult.value;

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

  const queryClassifier = new QueryClassifierService();
  const routingService = new RoutingService(queryClassifier);
  const searchService = new SearchService(routingService);

  return ok(searchService);
}

function startServer(): ResultAsync<void, CliError> {
  const serviceResult = setupServices();

  return serviceResult.match(
    (searchService) => {
      logToStderr("Starting ResearchMCP server...");
      logToStderr("Server capabilities:");
      logToStderr("- search tool: enabled");
      logToStderr("- resources: minimal implementation");
      logToStderr("- prompts: minimal implementation");

      const mcpServer = createMcpServer(searchService);

      return ResultAsync.fromPromise(
        startMcpStdioServer(mcpServer),
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
