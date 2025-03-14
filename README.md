# ResearchMCP

A research tool that combines Model Context Protocol (MCP) and Brave Search to achieve research functionality equivalent to ChatGPT's DeepResearch.

## Technology Stack

- **Runtime**: Deno
- **Framework**: Hono
- **Error Handling**: Neverthrow (Result<T, E> pattern)
- **Validation**: Hono's built-in validator (extended as needed)
- **Deployment**: Docker container

## Setup

1. Install [Deno](https://deno.land/)
2. Clone the repository
3. Set environment variables
   - `BRAVE_API_KEY`: Brave Search API key
   - `CLAUDE_API_KEY`: Claude API key (optional)
4. Run the application

   ```
   deno task start
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

## Development

```
deno task dev
```

## Test

```
deno task test
```

## Docker build && exec

```
docker build -t research-mcp .
docker run -p 8000:8000 -e BRAVE_API_KEY=your_key research-mcp
```
