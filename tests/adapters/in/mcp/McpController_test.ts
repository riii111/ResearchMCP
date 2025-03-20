import { assertEquals, assertExists } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { beforeEach, describe, it } from "https://deno.land/std@0.211.0/testing/bdd.ts";
import { McpController } from "../../../../src/adapters/in/mcp/McpController.ts";
import { SearchUseCase } from "../../../../src/application/ports/in/SearchUseCase.ts";
import { McpError, McpRequest, McpResponse, McpResult } from "../../../../src/domain/models/mcp.ts";
import { QueryParams, SearchError, SearchResponse } from "../../../../src/domain/models/search.ts";
import { err, ok, Result } from "neverthrow";
import { Context } from "hono";

// Mock SearchUseCase
class MockSearchUseCase implements SearchUseCase {
  public searchMcpCalled = false;
  public lastQuery = "";
  public mockResults: McpResult[] = [];
  public shouldFail = false;

  searchMcp(request: McpRequest): Promise<Result<McpResponse, McpError>> {
    this.searchMcpCalled = true;
    this.lastQuery = request.query;

    if (this.shouldFail) {
      return Promise.resolve(err({
        type: "search" as const,
        message: "Search failed",
        details: "Mock search error",
      }));
    }

    return Promise.resolve(ok({
      status: "success" as const,
      results: this.mockResults,
    }));
  }

  multiSearch(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    // Simple implementation for interface compliance
    return Promise.resolve(ok({
      query: params,
      results: [],
      totalResults: 0,
      searchTime: 0,
      source: "mock",
    }));
  }
}

// Mock Context
function createMockContext(): Context {
  const headers = new Headers();
  const req = new Request("https://example.com/mcp/search", {
    method: "POST",
    headers,
  });

  return {
    req,
    res: undefined,
    // Mock json method
    json: (data: unknown, options?: { status?: number }) => {
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
        status: options?.status || 200,
      });
    },
  } as unknown as Context;
}

describe("McpController", () => {
  let mockSearchUseCase: MockSearchUseCase;
  let controller: McpController;
  let _mockContext: Context;

  beforeEach(() => {
    mockSearchUseCase = new MockSearchUseCase();
    controller = new McpController(mockSearchUseCase);
    _mockContext = createMockContext();
  });

  describe("createRouter", () => {
    it("should create a router", () => {
      const router = controller.createRouter();
      assertExists(router);
    });
  });

  describe("registerSearchTool", () => {
    it("should register search tool with MCP server", () => {
      // This is a bit hard to test directly since we'd need to mock the MCP server
      const mockServer = {
        tool: (_name: string, _description: string, _schema: unknown, _handler: unknown) => {
          // Mock implementation
        },
      };

      // @ts-ignore - Type mismatch is expected in test
      controller.registerSearchTool(mockServer);
      // If we get here without an error, the test passes
    });
  });

  describe("formatSearchResults", () => {
    it("should format search results correctly", () => {
      const results: McpResult[] = [
        {
          title: "Test Result",
          url: "https://example.com",
          snippet: "This is a test result",
          published: "2023-01-01T00:00:00Z",
        },
      ];

      // @ts-ignore - Accessing private method for testing
      const formatted = controller.formatSearchResults(results);

      assertEquals(
        formatted.includes("1. Test Result"),
        true,
        "Formatted results should include the title",
      );
      assertEquals(
        formatted.includes("URL: https://example.com"),
        true,
        "Formatted results should include the URL",
      );
      assertEquals(
        formatted.includes("This is a test result"),
        true,
        "Formatted results should include the snippet",
      );
    });

    it("should handle empty results", () => {
      // @ts-ignore - Accessing private method for testing
      const formatted = controller.formatSearchResults([]);
      assertEquals(formatted, "No results found.");
    });
  });

  // Note: Testing the HTTP handler methods would require more complex mocking
  // of the Hono Context, which is beyond the scope of this basic test.
  // In a real-world scenario, you might use a library like supertest
  // or create more sophisticated mocks.
});
