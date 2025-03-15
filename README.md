# ResearchMCP

A research tool that combines Model Context Protocol (MCP) and Brave Search to achieve research
functionality equivalent to ChatGPT's DeepResearch.

## Technology Stack

- **Runtime**: Deno
- **Framework**: Hono
- **Error Handling**: Neverthrow (Result<T, E> pattern)
- **Validation**: Hono's built-in validator (extended as needed)
- **Deployment**: Docker container

## Setup

### Local Development

1. Install [Deno](https://deno.land/)
2. Clone the repository
3. Set environment variables
   - `BRAVE_API_KEY`: Brave Search API key
   - `CLAUDE_API_KEY`: Claude API key (optional)
4. Initialize the local development environment:

   ```
   make local-init
   ```

5. Run the application locally:

   ```
   make local-dev
   ```

### Container Environment

1. Install Docker and Docker Compose
2. Set environment variables
   - `BRAVE_API_KEY`: Brave Search API key
   - `CLAUDE_API_KEY`: Claude API key (optional)
3. Build and run the container:

   ```
   make d-build
   make d-up
   ```

## Project Structure

- `src/`: Source code
  - `routes/`: API route definitions
  - `services/`: Business logic
  - `types/`: Type definitions
  - `utils/`: Utility functions
- `tests/`: Test files
- `.rules/`: Project requirements and rules
- `docker/`: Docker-related files

## Development Workflow

### Local Development

For local development without Docker:

```bash
# Start the development server with watch mode
make dev

# Run tests
make test

# Run linter
make lint

# Format code
make format

# Type check
make check
```

### Docker-based Development

For development inside Docker (recommended for consistent environment):

```bash
# Build the Docker image
make d-build

# Start the container in foreground with live reloading
make d-dev

# Run in background
make d-up
make d-logs

# Stop the container
make d-down
```

The Docker setup includes volume mounts for the project directory, so any code changes will be
immediately reflected in the running container.

## Hybrid Development Approach

This project supports a hybrid development approach where you can:

1. Use your local IDE/editor for code editing
2. Run the application and tests either locally or in a container
3. Share dependencies and configurations consistently

Choose the workflow that best suits your preferences and needs.

## Environment Variables

Create a `.env` file with the following variables:

```
BRAVE_API_KEY=your_brave_search_api_key
CLAUDE_API_KEY=your_claude_api_key
```

These will be automatically loaded by Docker Compose in container mode.

## System Architecture

### High-Level Overview

The following simplified diagram shows the key components and external relationships:

```mermaid
graph LR
    %% External Systems
    Claude["Claude Desktop
    (MCP Client)"]
    BraveAPI["Brave Search API"]
    ClaudeAPI["Claude API"]
    
    %% Main Components
    subgraph ResearchMCP["ResearchMCP Server"]
        MCPEndpoint["/mcp/search
        Standard MCP Endpoint"]
        ResearchEndpoint["/research
        Enhanced Analysis Endpoint"]
    end
    
    %% External Connections
    Claude -->|1. Search Request| MCPEndpoint
    MCPEndpoint -->|2. Search Query| BraveAPI
    BraveAPI -->|3. Search Results| MCPEndpoint
    MCPEndpoint -->|4. MCP Response| Claude
    
    Claude -->|A. Research Request| ResearchEndpoint
    ResearchEndpoint -->|B. Search Query| BraveAPI
    BraveAPI -->|C. Search Results| ResearchEndpoint
    ResearchEndpoint -->|D. Analysis Request| ClaudeAPI
    ClaudeAPI -->|E. Analysis Results| ResearchEndpoint
    ResearchEndpoint -->|F. Enhanced Response| Claude
    
    %% Styling
    classDef external fill:#f9e6d2,stroke:#333,stroke-width:2px,color:#000
    classDef component fill:#e6f5ed,stroke:#333,color:#000
    classDef container fill:#f5f5f5,stroke:#333,color:#000
    
    class Claude,BraveAPI,ClaudeAPI external
    class MCPEndpoint,ResearchEndpoint component
    class ResearchMCP container
```

This simplified diagram focuses on how the system interacts with external components:

1. **Standard MCP Flow** (Numbers 1-4):
   - Claude Desktop sends a search request to the standard MCP endpoint
   - The server queries Brave Search API and returns formatted results

2. **Enhanced Research Flow** (Letters A-F):
   - Claude Desktop sends a request to the research endpoint
   - The server queries Brave Search API for results
   - The results are sent to Claude API for analysis and summarization
   - An enhanced response with summary, insights, and sources is returned

### Detailed Architecture

The following detailed diagram illustrates the complete system architecture and data flow:

```mermaid
graph TD
    %% External Systems
    Claude["Claude Desktop
    (MCP Client)"]
    BraveAPI["Brave Search API"]
    ClaudeAPI["Claude API"]
    
    %% ResearchMCP Components
    subgraph ResearchMCP["ResearchMCP Server"]
        %% Routes Layer
        subgraph Routes["Routes Layer"]
            MCPRoute["/mcp/search Endpoint"]
            ResearchRoute["/research Endpoint"]
        end
        
        %% Service Layer
        subgraph Services["Services Layer"]
            SearchService["SearchService"]
            ResearchService["ResearchService"]
        end
        
        %% Adapters Layer
        subgraph Adapters["Adapters Layer (Ports)"]
            SearchAdapter["SearchAdapter Interface"]
            CacheAdapter["CacheAdapter Interface"]
            ClaudeAdapter["ClaudeAdapter Interface"]
        end
        
        %% Adapter Implementations
        subgraph Implementations["Adapter Implementations"]
            BraveAdapter["BraveSearchAdapter"]
            MemoryCache["MemoryCacheAdapter"]
            AnthropicAdapter["AnthropicClaudeAdapter"]
        end
    end
    
    %% Connections
    Claude -->|1. MCP Request| MCPRoute
    MCPRoute -->|2. Process Request| SearchService
    SearchService -->|3. Call Adapter| SearchAdapter
    SearchAdapter -.->|Interface| BraveAdapter
    BraveAdapter -->|4. API Call| BraveAPI
    BraveAPI -->|5. Search Results| BraveAdapter
    BraveAdapter -->|6. Map Results| SearchService
    SearchService -->|7. Format Response| MCPRoute
    MCPRoute -->|8. MCP Response| Claude
    
    %% Research Flow
    Claude -->|1. Research Request| ResearchRoute
    ResearchRoute -->|2. Process Request| ResearchService
    ResearchService -->|3. Get Search Results| SearchService
    ResearchService -->|4. Analyze Results| ClaudeAdapter
    ClaudeAdapter -.->|Interface| AnthropicAdapter
    AnthropicAdapter -->|5. API Call| ClaudeAPI
    ClaudeAPI -->|6. Analysis Results| AnthropicAdapter
    AnthropicAdapter -->|7. Process Results| ResearchService
    ResearchService -->|8. Format Response| ResearchRoute
    ResearchRoute -->|9. Research Response| Claude
    
    %% Cache Flow
    BraveAdapter <-->|Cache Results| CacheAdapter
    CacheAdapter -.->|Interface| MemoryCache
    
    %% Styling
    classDef external fill:#f9e6d2,stroke:#333,stroke-width:2px,color:#000
    classDef layer fill:#e7f2fa,stroke:#333,stroke-width:1px,color:#000
    classDef component fill:#e6f5ed,stroke:#333,color:#000
    classDef interface fill:#fff2cc,stroke:#333,color:#000
    classDef container fill:#f5f5f5,stroke:#333,color:#000
    
    class Claude,BraveAPI,ClaudeAPI external
    class Routes,Services,Adapters,Implementations layer
    class MCPRoute,ResearchRoute,SearchService,ResearchService component
    class SearchAdapter,CacheAdapter,ClaudeAdapter interface
    class BraveAdapter,MemoryCache,AnthropicAdapter component
    class ResearchMCP container
```

### Architecture Explanation

1. **Client Interaction**:
   - Claude Desktop (or any MCP-compatible client) sends requests to the ResearchMCP server
   - Two main endpoints are available:
     - `/mcp/search`: Standard MCP-compliant search endpoint
     - `/research`: Enhanced endpoint with Claude-powered analysis

2. **Layered Architecture**:
   - **Routes Layer**: Handles HTTP requests/responses and validation
   - **Services Layer**: Contains business logic for search and research
   - **Adapters Layer**: Defines interfaces (ports) for external dependencies
   - **Implementations**: Concrete implementations of the adapter interfaces

3. **Data Flow**:
   - **MCP Flow**: Client → MCP Endpoint → SearchService → BraveSearchAdapter → Brave API → Client
   - **Research Flow**: Client → Research Endpoint → ResearchService → SearchService + ClaudeAdapter → Client

4. **Port and Adapter Pattern**:
   - Core application logic is isolated from external dependencies
   - Interfaces (SearchAdapter, CacheAdapter, ClaudeAdapter) define the "ports"
   - Implementations (BraveSearchAdapter, MemoryCacheAdapter, AnthropicClaudeAdapter) provide concrete implementations

This architecture enables flexible extension and replacement of components while maintaining a clean separation of concerns.
