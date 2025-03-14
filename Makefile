.PHONY: start dev test lint format check d-build d-up d-down clean help

# Default target
.DEFAULT_GOAL := help

# Constants
COMPOSE_FILE = compose.yml
DOCKER_IMAGE = research-mcp

# Help
help:
	@echo "ResearchMCP Makefile Help"
	@echo "--------------------------"
	@echo "make start       - Run the application"
	@echo "make dev         - Run the application in development mode with watch"
	@echo "make test        - Run tests"
	@echo "make lint        - Run linter"
	@echo "make format      - Format code"
	@echo "make check       - Type check"
	@echo "make d-build     - Build Docker image"
	@echo "make d-up        - Start Docker containers"
	@echo "make d-down      - Stop Docker containers"
	@echo "make d-logs      - View Docker logs"
	@echo "make d-test      - Run tests in Docker"
	@echo "make init        - Initialize development environment"
	@echo "make dev-setup   - Reset and setup Docker environment for development"
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

# Clean temporary files
clean:
	@echo "Cleaning temporary files..."
	rm -rf .DS_Store **/.DS_Store
	@echo "Done."

# Docker utilities
d-logs:
	docker compose -f $(COMPOSE_FILE) logs -f

d-restart:
	docker compose -f $(COMPOSE_FILE) restart

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