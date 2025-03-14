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

The Docker setup includes volume mounts for the project directory, so any code changes will be immediately reflected in the running container.

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
