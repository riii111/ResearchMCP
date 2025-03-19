import { Hono } from "hono";
import { SearchUseCase } from "../application/ports/in/SearchUseCase.ts";
import { SearchRepository } from "../application/ports/out/SearchRepository.ts";
import { CacheRepository } from "../application/ports/out/CacheRepository.ts";
import { QueryClassifierPort } from "../application/ports/out/QueryClassifierPort.ts";
import { SearchService } from "../application/services/SearchService.ts";
import { RoutingService } from "../application/services/RoutingService.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { McpController } from "../adapters/in/mcp/McpController.ts";
import { createMcpRouter } from "../adapters/in/mcp/McpRouting.ts";
import { SearchController } from "../adapters/in/http/SearchController.ts";
import { err, ok, Result } from "neverthrow";
import { AdapterContainer } from "./adapters.ts";

export class DependencyInjection {
  private searchRepositories: SearchRepository[] = [];
  private queryClassifier?: QueryClassifierPort;
  private cacheRepository?: CacheRepository;
  private routingService?: RoutingService;
  private searchService?: SearchService;
  private adapterContainer?: AdapterContainer;

  constructor(adapterContainer?: AdapterContainer) {
    this.adapterContainer = adapterContainer;

    if (adapterContainer) {
      this.registerCacheRepository(adapterContainer.cache);
      this.registerQueryClassifier(adapterContainer.classifier);
      this.registerSearchRepository(adapterContainer.search);
    }
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

  registerCacheRepository(repository: CacheRepository): this {
    this.cacheRepository = repository;
    return this;
  }

  getRoutingService(): RoutingService {
    if (!this.routingService) {
      if (!this.queryClassifier) {
        throw new Error("QueryClassifier not registered");
      }

      this.routingService = new RoutingService(
        this.queryClassifier,
        this.searchRepositories,
      );
    }

    return this.routingService;
  }

  getSearchService(): SearchUseCase {
    if (!this.searchService) {
      const routingService = this.getRoutingService();
      this.searchService = new SearchService(routingService);
    }

    return this.searchService;
  }

  getMcpController(): McpController {
    const searchService = this.getSearchService();
    return new McpController(searchService);
  }

  getMcpRouter(): Hono {
    const searchService = this.getSearchService();
    return createMcpRouter(searchService);
  }

  getHttpController(): SearchController {
    const searchService = this.getSearchService();
    return new SearchController(searchService);
  }

  getHttpRouter(): Hono {
    const controller = this.getHttpController();
    return controller.createRouter();
  }

  createMcpServer(): McpServer {
    const encoder = new TextEncoder();
    const log = (message: string) => {
      Deno.stderr.writeSync(encoder.encode(message + "\n"));
    };

    const server = new McpServer({
      name: "ResearchMCP",
      version: "0.1.0",
      capabilities: {
        resources: {}, // Enable resources capability
        prompts: {}, // Enable prompts capability
      },
    });

    // Register an empty prompt to support prompts/list method
    server.prompt(
      "empty-prompt",
      "Empty placeholder prompt for MCP protocol compliance",
      {}, // Empty args schema
      (_args) => ({
        messages: [{
          role: "assistant", // Using "assistant" as per MCP protocol requirements
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

    this.setupSearchTool(server);

    log("MCP server configured with search tool");
    return server;
  }

  private setupSearchTool(server: McpServer): void {
    const searchService = this.getSearchService();
    const controller = new McpController(searchService);
    controller.registerSearchTool(server);
  }

  async startMcpServer(): Promise<Result<void, Error>> {
    const encoder = new TextEncoder();
    Deno.stderr.writeSync(
      encoder.encode("Starting MCP server with stdio transport...\n"),
    );

    const server = this.createMcpServer();
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

  static fromAdapterContainer(container: AdapterContainer): DependencyInjection {
    return new DependencyInjection(container);
  }
}
