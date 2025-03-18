import { assertEquals, assertExists, assertRejects } from "testing/asserts.ts";
import { afterEach, beforeEach, describe, it } from "testing/bdd.ts";
import { McpController } from "../../../../src/adapters/in/mcp/McpController.ts";
import { SearchUseCase } from "../../../../src/application/ports/in/SearchUseCase.ts";
import { McpRequest, McpResponse, McpResult } from "../../../../src/domain/models/mcp.ts";
import { err, ok } from "neverthrow";
import { Context } from "hono";

// Mock SearchUseCase
class MockSearchUseCase implements SearchUseCase {
  public searchMcpCalled = false;
  public lastQuery = "";
  public mockResults: McpResult[] = [];
  public shouldFail = false;

  async searchMcp(request: McpRequest) {
    this.searchMcpCalled = true;
    this.lastQuery = request.query;

    if (this.shouldFail) {
      return err({
        type: "search",
        message: "Search failed",
        details: "Mock search error",
      });
    }

    return ok({
      results: this.mockResults,
    } as McpResponse);
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
  let mockContext: Context;

  beforeEach(() => {
    mockSearchUseCase = new MockSearchUseCase();
    controller = new McpController(mockSearchUseCase);
    mockContext = createMockContext();
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
      // We'll just verify it doesn't throw an error
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
