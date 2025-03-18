import { SearchUseCase } from "../ports/in/SearchUseCase.ts";
import { SearchRepository } from "../ports/out/SearchRepository.ts";
import { CacheRepository } from "../ports/out/CacheRepository.ts";
import { QueryClassifierPort } from "../ports/out/QueryClassifierPort.ts";
import { SearchService } from "../services/search/SearchService.ts";
import { RoutingService } from "../services/search/RoutingService.ts";
import { createMcpServer, startMcpStdioServer } from "../services/mcp/McpService.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Result } from "neverthrow";

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
  private mcpServer?: McpServer;

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

  getMcpServer(): McpServer {
    if (!this.mcpServer) {
      const searchService = this.getSearchService();
      this.mcpServer = createMcpServer(searchService);
    }

    return this.mcpServer;
  }

  async startMcpServer(): Promise<Result<void, Error>> {
    const server = this.getMcpServer();
    return await startMcpStdioServer(server);
  }
}
