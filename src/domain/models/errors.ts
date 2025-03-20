export type DomainErrorType =
  | "validation" // Validation error (400)
  | "parse" // Parse error (400)
  | "not_found" // Resource not found (404)
  | "conflict" // Resource conflict (409)
  | "unauthorized" // Authentication error (401)
  | "forbidden" // Permission error (403)
  | "rate_limit" // Rate limit (429)
  | "search" // Search error (500)
  | "server" // Server error (500)
  | "external"; // External service error (502)

export interface DomainError {
  type: DomainErrorType;
  message: string;
  details?: unknown;
}

export function getErrorStatusCode(error: DomainError | { type: string }): number {
  switch (error.type) {
    case "validation":
    case "parse":
      return 400;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "rate_limit":
      return 429;
    case "external":
      return 502;
    case "search":
    case "server":
    default:
      return 500;
  }
}
