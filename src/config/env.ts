/**
 * Type definition representing a collection of API keys
 */
export interface ApiKeys {
  brave: string;
  tavily?: string;
  github?: string;
  stackExchange?: string;
}

/**
 * Load API keys from environment variables
 * @returns API keys object
 */
export function loadApiKeys(): ApiKeys {
  const braveApiKey = Deno.env.get("BRAVE_API_KEY");

  if (!braveApiKey) {
    Deno.stderr.writeSync(
      new TextEncoder().encode("Environment variable BRAVE_API_KEY is not set\n"),
    );
    Deno.exit(1);
  }

  return {
    brave: braveApiKey,
    tavily: Deno.env.get("TAVILY_API_KEY"),
    github: Deno.env.get("GITHUB_API_TOKEN"),
    stackExchange: Deno.env.get("STACKEXCHANGE_API_KEY"),
  };
}

/**
 * Get the server port number from environment variables
 * @returns Port number
 */
export function getServerPort(): number {
  return parseInt(Deno.env.get("PORT") || "8088");
}
