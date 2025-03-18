import { Hono } from "hono";
import { SearchUseCase } from "../ports/in/SearchUseCase.ts";
import { SearchRepository } from "../ports/out/SearchRepository.ts";
import { CacheRepository } from "../ports/out/CacheRepository.ts";
import { QueryClassifierPort } from "../ports/out/QueryClassifierPort.ts";
import { SearchService } from "../services/search/SearchService.ts";
import { RoutingService } from "../services/search/RoutingService.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { createMcpRouter, McpController } from "../../adapters/in/mcp/index.ts";
import { SearchController } from "../../adapters/in/http/index.ts";
import { err, ok, Result } from "neverthrow";
import { AdapterContainer } from "../../config/adapters.ts";

/**
 * Dependency Injection container for the application
 * Manages the creation and wiring of application components
 */
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

  registerSearchRepository(repository: SearchRepository): this {
    this.searchRepositories.push(repository);
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

    try {
      const server = this.createMcpServer();
      const transport = new StdioServerTransport();

      // Connect to transport - all JSON-RPC messages will use stdout
      await server.connect(transport);

      Deno.stderr.writeSync(encoder.encode("MCP server connected via stdio transport\n"));
      return ok(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      Deno.stderr.writeSync(
        encoder.encode(`Failed to start MCP server: ${errorMessage}\n`),
      );
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Factory method to create a dependency injection container from adapter container
   */
  static fromAdapterContainer(container: AdapterContainer): DependencyInjection {
    return new DependencyInjection(container);
  }
}
