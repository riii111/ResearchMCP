import { Hono } from "hono";
import { SearchUseCase } from "../application/ports/in/SearchUseCase.ts";
import { SearchRepository } from "../application/ports/out/SearchRepository.ts";
import { QueryClassifierPort } from "../application/ports/out/QueryClassifierPort.ts";
import { SearchService } from "../application/services/SearchService.ts";
import { RoutingService } from "../application/services/RoutingService.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { McpController } from "../adapters/in/mcp/McpController.ts";
import { SearchController } from "../adapters/in/http/SearchController.ts";
import { err, ok, Result } from "neverthrow";
import { AdapterContainer } from "./adapters.ts";

export type DIError =
  | { type: "already_initialized"; message: string }
  | { type: "not_initialized"; message: string }
  | { type: "missing_dependency"; message: string };

/**
 * Dependency Injection container for the application
 */
export class AppDI {
  private searchRepositories: SearchRepository[] = [];
  private queryClassifier?: QueryClassifierPort;
  private routingService?: RoutingService;
  private searchService?: SearchService;
  private mcpController?: McpController;
  private httpController?: SearchController;

  private initialized = false;

  constructor() {}

  /**
   * Initialize the DI container with adapters
   */
  initialize(adapterContainer: AdapterContainer): Result<this, DIError> {
    if (this.initialized) {
      return err({
        type: "already_initialized",
        message: "AppDI already initialized",
      });
    }

    this.registerSearchRepository(adapterContainer.search);
    this.registerQueryClassifier(adapterContainer.classifier);
    this.initialized = true;

    return ok(this);
  }

  /**
   * Check if the DI container has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  registerSearchRepository(repository: SearchRepository | SearchRepository[]): this {
    if (Array.isArray(repository)) {
      this.searchRepositories.push(...repository);
    } else {
      this.searchRepositories.push(repository);
    }
    return this;
  }

  registerQueryClassifier(classifier: QueryClassifierPort): this {
    this.queryClassifier = classifier;
    return this;
  }

  getRoutingService(): Result<RoutingService, DIError> {
    if (!this.initialized) {
      return err({
        type: "not_initialized",
        message: "DI container not initialized. Call initialize() first.",
      });
    }

    if (!this.routingService) {
      if (!this.queryClassifier) {
        return err({
          type: "missing_dependency",
          message: "QueryClassifier not registered",
        });
      }

      this.routingService = new RoutingService(
        this.queryClassifier,
        this.searchRepositories,
      );
    }

    return ok(this.routingService);
  }

  getSearchService(): Result<SearchUseCase, DIError> {
    const routingResult = this.getRoutingService();
    if (routingResult.isErr()) {
      return err(routingResult.error);
    }

    if (!this.searchService) {
      this.searchService = new SearchService(routingResult.value);
    }

    return ok(this.searchService);
  }

  getMcpController(): Result<McpController, DIError> {
    const searchResult = this.getSearchService();
    if (searchResult.isErr()) {
      return err(searchResult.error);
    }

    if (!this.mcpController) {
      this.mcpController = new McpController(searchResult.value);
    }
    return ok(this.mcpController);
  }

  getMcpRouter(): Result<Hono, DIError> {
    const controllerResult = this.getMcpController();
    if (controllerResult.isErr()) {
      return err(controllerResult.error);
    }

    return ok(controllerResult.value.createRouter());
  }

  getHttpController(): Result<SearchController, DIError> {
    const searchResult = this.getSearchService();
    if (searchResult.isErr()) {
      return err(searchResult.error);
    }

    if (!this.httpController) {
      this.httpController = new SearchController(searchResult.value);
    }
    return ok(this.httpController);
  }

  getHttpRouter(): Result<Hono, DIError> {
    const controllerResult = this.getHttpController();
    if (controllerResult.isErr()) {
      return err(controllerResult.error);
    }

    return ok(controllerResult.value.createRouter());
  }

  createMcpServer(): Result<McpServer, DIError> {
    const encoder = new TextEncoder();
    const log = (message: string) => {
      Deno.stderr.writeSync(encoder.encode(message + "\n"));
    };

    const server = new McpServer({
      name: "ResearchMCP",
      version: "0.1.0",
      capabilities: {
        resources: {},
        prompts: {},
      },
    });

    server.prompt(
      "empty-prompt",
      "Empty placeholder prompt for MCP protocol compliance",
      {},
      (_args) => ({
        messages: [{
          role: "assistant",
          content: {
            type: "text",
            text: "Empty prompt for MCP protocol compliance",
          },
        }],
      }),
    );

    server.resource(
      "empty-resource",
      "empty://resource",
      () => ({
        contents: [],
      }),
    );

    const setupResult = this.setupSearchTool(server);
    if (setupResult.isErr()) {
      return err(setupResult.error);
    }

    log("MCP server configured with search tool");
    return ok(server);
  }

  private setupSearchTool(server: McpServer): Result<void, DIError> {
    const controllerResult = this.getMcpController();
    if (controllerResult.isErr()) {
      return err(controllerResult.error);
    }

    controllerResult.value.registerSearchTool(server);
    return ok(undefined);
  }

  async startMcpServer(): Promise<Result<void, DIError | Error>> {
    const encoder = new TextEncoder();
    Deno.stderr.writeSync(
      encoder.encode("Starting MCP server with stdio transport...\n"),
    );

    const serverResult = this.createMcpServer();
    if (serverResult.isErr()) {
      return err(serverResult.error);
    }

    const server = serverResult.value;
    const transport = new StdioServerTransport();

    const result = await this.connectToTransport(server, transport);

    if (result.isOk()) {
      Deno.stderr.writeSync(encoder.encode("MCP server connected via stdio transport\n"));
      return ok(undefined);
    } else {
      const error = result.error;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      Deno.stderr.writeSync(
        encoder.encode(`Failed to start MCP server: ${errorMessage}\n`),
      );
      return err(error);
    }
  }

  private async connectToTransport(
    server: McpServer,
    transport: StdioServerTransport,
  ): Promise<Result<void, Error>> {
    return await server.connect(transport)
      .then(() => ok(undefined))
      .catch((error: unknown) => err(error instanceof Error ? error : new Error(String(error))));
  }
}

// Singleton instance of the DI container
export const appDI = new AppDI();
