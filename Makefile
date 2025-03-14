.PHONY: start dev test lint format check d-build d-up d-down d-logs d-restart clean help

# Default target
.DEFAULT_GOAL := help

# Constants
COMPOSE_FILE = compose.yml
DOCKER_IMAGE = research-mcp

# Help
help:
	@echo "ResearchMCP Makefile Help"
	@echo "--------------------------"
	@echo "Local Development Commands:"
	@echo "make start       - Run the application locally"
	@echo "make dev         - Run the application locally in development mode with watch"
	@echo "make test        - Run tests locally"
	@echo "make lint        - Run linter locally"
	@echo "make format      - Format code locally"
	@echo "make check       - Type check locally"
	@echo "make local-init  - Initialize local development environment"
	@echo "make local-dev   - Run local development server"
	@echo "make local-test  - Run tests locally"
	@echo
	@echo "Docker Development Commands:"
	@echo "make d-build     - Build Docker image"
	@echo "make d-up        - Start Docker containers in background"
	@echo "make d-dev       - Start Docker containers in foreground (with logs)"
	@echo "make d-down      - Stop Docker containers"
	@echo "make d-logs      - View Docker logs"
	@echo "make d-restart   - Restart Docker containers"
	@echo
	@echo "Utility Commands:"
	@echo "make clean       - Clean temporary files"
	@echo "make help        - Show this help message"

# Deno commands
start:
	deno task start

dev:
	deno task dev

test:
	deno task test

lint:
	deno task lint

format:
	deno task fmt

check:
	deno task check

# Docker commands
d-build:
	docker compose -f $(COMPOSE_FILE) build

d-up:
	docker compose -f $(COMPOSE_FILE) up -d

d-down:
	docker compose -f $(COMPOSE_FILE) down -v

d-logs:
	docker compose -f $(COMPOSE_FILE) logs -f

d-restart:
	docker compose -f $(COMPOSE_FILE) restart

# Run development server in foreground
d-dev:
	docker compose -f $(COMPOSE_FILE) up

# Clean temporary files
clean:
	@echo "Cleaning temporary files..."
	rm -rf .DS_Store **/.DS_Store
	@echo "Done."

# Docker utilities
d-test:
	docker compose -f $(COMPOSE_FILE) run --rm app deno test --allow-net --allow-env

# All-in-one commands
all-tests: lint check test

rebuild: d-down d-build d-up
	@echo "Rebuild complete, containers are running."

# Check if Deno is installed
check-deno:
	@command -v deno > /dev/null || (echo "Deno is not installed. Please install Deno first." && exit 1)

# Initialize environment
init: check-deno
	@echo "Checking dependencies..."
	deno cache --reload main.ts
	deno task cache
	@echo "Environment initialized."

# Reset environment for development
dev-setup: d-down d-build d-up
	@echo "Setting up development environment..."
	docker compose -f $(COMPOSE_FILE) exec app deno cache --reload main.ts
	@echo "Development environment ready!"

# Initialize local development environment
local-init: check-deno
	@echo "Setting up local development environment..."
	deno cache --reload main.ts
	@echo "Downloading dependencies..."
	deno task cache
	@echo "Local development environment ready!"

# Run local development server
local-dev: check-deno
	@echo "Starting local development server..."
	deno task dev

# Run tests locally
local-test: check-deno
	@echo "Running tests locally..."
	deno task test