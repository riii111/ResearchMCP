[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/riii111-researchmcp-badge.png)](https://mseep.ai/app/riii111-researchmcp)

# ResearchMCP

A research tool that combines the Model Context Protocol (MCP) with Brave Search, Tavily Search,
etc. to achieve research capabilities equivalent to (or aiming to be equivalent to) ChatGPT's
DeepResearch.

## Technology Stack

- **Runtime**: Deno
- **Framework**: Hono
- **Error Handling**: Neverthrow (Result<T, E> pattern)
- **Deployment**: Docker container

## Setup

### Local Development

1. Install [Deno](https://deno.land/)
2. Clone the repository
3. Set environment variables
   - `BRAVE_API_KEY`: Brave Search API key
   - `TAVILY_API_KEY`: Tavily Search API key (optional)
4. Run the application:

   ```bash
   make dev  # HTTP server
   make mcp  # MCP server for Claude Desktop
   ```

### Container Environment

1. Install Docker and Docker Compose
2. Set environment variables in a `.env` file
3. Build and run the container:

   ```bash
   make d-build
   make d-up
   ```

## Development Commands

```bash
# Local development
make dev     # Start HTTP server with watch mode
make mcp     # Start MCP server for Claude Desktop
make test    # Run tests
make lint    # Run linter
make format  # Format code
make check   # Type check

# Docker development
make d-build  # Build the image
make d-dev    # Start container with live reload
make d-up     # Run in background
make d-logs   # View logs
make d-down   # Stop container
```

## MCP Integration with Claude Desktop

1. Run the MCP server: `make mcp`
2. In Claude Desktop, add a new MCP server with the following configuration:

   ```json
   {
     "mcpServers": {
       "MCPSearch": {
         "description": "Web search powered by Brave, Tavily, etc.",
         "command": "/absolute/path/to/ResearchMCP/cli.ts",
         "args": [],
         "transport": "stdio",
         "env": {
           "BRAVE_API_KEY": "your_brave_api_key_here",
           "TAVILY_API_KEY": "your_tavily_api_key_here"
         }
       }
     }
   }
   ```

   Replace `/absolute/path/to/ResearchMCP/cli.ts` with the actual path to the cli.ts file.

### Known Limitations

- **Language Support**: Brave Search API has limited support for non-Latin characters. Searches in
  Japanese, Chinese, Korean, and other non-Latin script languages may fail with encoding errors. For
  best results, use English queries.

### Features

- **Web Search**: Search the web using Brave Search API through Claude Desktop
- **MCP Protocol**: Full compliance with the Model Context Protocol
- **Caching**: Search results are cached to improve performance and reduce API calls
