import { MemoryCacheAdapter } from "../adapters/cache/memoryCache.ts";
import { registerBraveSearchAdapter } from "../adapters/search/braveSearchAdapter.ts";
import { registerTavilySearchAdapter } from "../adapters/search/tavilySearchAdapter.ts";
import { registerWikipediaAdapter } from "../adapters/search/wikipediaAdapter.ts";
import { registerGitHubAdapter } from "../adapters/search/githubAdapter.ts";
import { registerStackExchangeAdapter } from "../adapters/search/stackExchangeAdapter.ts";
import { AnthropicClaudeAdapter } from "../adapters/claude/claudeAdapter.ts";
import type { ApiKeys } from "../config/env.ts";

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

  registerBraveSearchAdapter(apiKeys.brave, container.cache);
  console.log("Registered BraveSearchAdapter");

  if (apiKeys.tavily) {
    registerTavilySearchAdapter(apiKeys.tavily, container.cache);
    console.log("Registered TavilySearchAdapter");
  } else {
    console.log("Tavily API integration disabled (no API key)");
  }

  registerWikipediaAdapter(container.cache);
  console.log("Registered WikipediaAdapter");

  if (apiKeys.github) {
    registerGitHubAdapter(apiKeys.github, container.cache);
    console.log("Registered GitHubAdapter");
  } else {
    console.log("GitHub API integration disabled (no API token)");
  }

  registerStackExchangeAdapter(apiKeys.stackExchange, container.cache);
  console.log(
    "Registered StackExchangeAdapter" +
      (apiKeys.stackExchange ? " with API key" : " without API key"),
  );

  // Initialize Claude API adapter (if API key is provided)
  if (apiKeys.claude) {
    container.claude = new AnthropicClaudeAdapter(apiKeys.claude);
    console.log("Claude API integration enabled");
  } else {
    console.log("Claude API integration disabled (no API key)");
  }

  return container;
}
