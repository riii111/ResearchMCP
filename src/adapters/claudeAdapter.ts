import { err, ok, Result } from "neverthrow";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type ClaudeError =
  | { type: "network"; message: string }
  | { type: "authorization"; message: string }
  | { type: "rate_limit"; retryAfter: number }
  | { type: "validation"; message: string };

export interface ClaudeAdapter {
  complete(request: ClaudeRequest): Promise<Result<ClaudeResponse, ClaudeError>>;
}

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-3-sonnet-20240229";
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;

export class AnthropicClaudeAdapter implements ClaudeAdapter {
  constructor(private readonly apiKey: string) {}

  complete(request: ClaudeRequest): Promise<Result<ClaudeResponse, ClaudeError>> {
    return this.executeWithBackoff(() => this.executeRequest(request));
  }

  private async executeRequest(
    request: ClaudeRequest,
  ): Promise<Result<ClaudeResponse, ClaudeError>> {
    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: request.model || DEFAULT_MODEL,
          messages: request.messages,
          max_tokens: request.max_tokens || 1024,
          temperature: request.temperature || 0.7,
          system: request.system,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return err({
            type: "authorization",
            message: `API Key authentication error: ${response.status}`,
          });
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const retryMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
          return err({
            type: "rate_limit",
            retryAfter: retryMs,
          });
        }

        const errorData = await response.json();
        return err({
          type: "validation",
          message: `API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`,
        });
      }

      const data = await response.json() as ClaudeResponse;
      return ok(data);
    } catch (error) {
      return err({
        type: "network",
        message: error instanceof Error ? error.message : "Unknown network error",
      });
    }
  }

  private async executeWithBackoff<T, E>(
    fn: () => Promise<Result<T, E>>,
    attempt = 1,
  ): Promise<Result<T, E>> {
    const result = await fn();

    if (result.isOk() || attempt >= MAX_RETRY_ATTEMPTS) {
      return result;
    }

    // Check if the error is a rate limit error that we can retry
    const error = result.error;
    if (typeof error === "object" && error !== null && "type" in error) {
      const typedError = error as { type: string; retryAfter?: number };

      if (typedError.type === "rate_limit") {
        // Use either the server-specified retry time or calculate backoff
        const retryAfter = typedError.retryAfter || this.calculateBackoff(attempt);
        console.log(
          `Rate limited. Retrying in ${retryAfter}ms (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`,
        );

        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        return this.executeWithBackoff(fn, attempt + 1);
      }
    }

    return result;
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialBackoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * exponentialBackoff;
    return exponentialBackoff + jitter;
  }
}
