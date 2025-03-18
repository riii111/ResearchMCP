import { MemoryCacheAdapter } from "../adapters/cache/memoryCache.ts";
import { registerBraveSearchAdapter } from "../adapters/search/braveSearchAdapter.ts";
import { registerTavilySearchAdapter } from "../adapters/search/tavilySearchAdapter.ts";
import { registerWikipediaAdapter } from "../adapters/search/wikipediaAdapter.ts";
// import { registerGitHubAdapter } from "../adapters/search/githubAdapter.ts";
// import { registerStackExchangeAdapter } from "../adapters/search/stackExchangeAdapter.ts";
import { AnthropicClaudeAdapter } from "../adapters/claude/claudeAdapter.ts";
import type { ApiKeys } from "./env.ts";

/**
 * Type definition representing the adapter container.
 */
export interface AdapterContainer {
  cache: MemoryCacheAdapter;
  claude?: AnthropicClaudeAdapter;
}

/**
 * Initializes and registers adapters.
 * @param apiKeys API keys object.
 * @returns Initialized adapter container.
 */
export function initializeAdapters(apiKeys: ApiKeys): AdapterContainer {
  const container: AdapterContainer = {
    cache: new MemoryCacheAdapter(),
  };

  const encoder = new TextEncoder();
  const log = (message: string) => {
    Deno.stderr.writeSync(encoder.encode(message + "\n"));
  };

  registerBraveSearchAdapter(apiKeys.brave, container.cache);
  log("Registered BraveSearchAdapter");

  if (apiKeys.tavily) {
    registerTavilySearchAdapter(apiKeys.tavily, container.cache);
    log("Registered TavilySearchAdapter");
  } else {
    log("Tavily API integration disabled (no API key)");
  }

  registerWikipediaAdapter(container.cache);
  log("Registered WikipediaAdapter");

  // TODO(@riii111) GitHub API and StackExchange API integration is disabled for now
  // if (apiKeys.github) {
  //   registerGitHubAdapter(apiKeys.github, container.cache);
  //   log("Registered GitHubAdapter");
  // } else {
  //   log("GitHub API integration disabled (no API token)");
  // }

  // registerStackExchangeAdapter(apiKeys.stackExchange, container.cache);
  // log("StackExchange API integration temporarily disabled");

  // // Initialize Claude API adapter (if API key is provided)
  // if (apiKeys.claude) {
  //   container.claude = new AnthropicClaudeAdapter(apiKeys.claude);
  //   log("Claude API integration enabled");
  // } else {
  //   log("Claude API integration disabled (no API key)");
  // }

  return container;
}
