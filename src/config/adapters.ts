import { CacheAdapterRepository } from "../adapters/out/cache/CacheAdapterRepository.ts";
import { SearchAdapterRepository } from "../adapters/out/search/SearchAdapterRepository.ts";
import { QueryClassifierAdapter } from "../adapters/out/classifier/QueryClassifierAdapter.ts";
import { MemoryCacheAdapter } from "../adapters/cache/memoryCache.ts";
import { registerBraveSearchAdapter } from "../adapters/search/braveSearchAdapter.ts";
import { registerTavilySearchAdapter } from "../adapters/search/tavilySearchAdapter.ts";
import { registerWikipediaAdapter } from "../adapters/search/wikipediaAdapter.ts";
import { searchAdapterRegistry } from "../adapters/search/registry.ts";
import { QueryClassifierService } from "../domain/services/queryClassifier.ts";
// import { registerGitHubAdapter } from "../adapters/search/githubAdapter.ts";
// import { registerStackExchangeAdapter } from "../adapters/search/stackExchangeAdapter.ts";
import type { ApiKeys } from "./env.ts";

/**
 * Type definition representing the adapter container.
 */
export interface AdapterContainer {
  cache: CacheAdapterRepository;
  search: SearchAdapterRepository;
  classifier: QueryClassifierAdapter;
}

/**
 * Initializes and registers adapters.
 * @param apiKeys API keys object.
 * @returns Initialized adapter container.
 */
export function initializeAdapters(apiKeys: ApiKeys): AdapterContainer {
  const encoder = new TextEncoder();
  const log = (message: string) => {
    Deno.stderr.writeSync(encoder.encode(message + "\n"));
  };

  // Initialize adapters
  const memoryCacheAdapter = new MemoryCacheAdapter();
  const cacheRepository = new CacheAdapterRepository(memoryCacheAdapter);

  // Register search adapters
  registerBraveSearchAdapter(apiKeys.brave, memoryCacheAdapter);
  log("Registered BraveSearchAdapter");

  if (apiKeys.tavily) {
    registerTavilySearchAdapter(apiKeys.tavily, memoryCacheAdapter);
    log("Registered TavilySearchAdapter");
  } else {
    log("Tavily API integration disabled (no API key)");
  }

  registerWikipediaAdapter(memoryCacheAdapter);
  log("Registered WikipediaAdapter");

  // TODO(@riii111) GitHub API and StackExchange API integration is disabled for now
  // if (apiKeys.github) {
  //   registerGitHubAdapter(apiKeys.github, memoryCacheAdapter);
  //   log("Registered GitHubAdapter");
  // } else {
  //   log("GitHub API integration disabled (no API token)");
  // }

  // registerStackExchangeAdapter(apiKeys.stackExchange, memoryCacheAdapter);
  // log("StackExchange API integration temporarily disabled");

  // Get the first available search adapter
  const searchAdapters = searchAdapterRegistry.getAllAdapters();
  if (searchAdapters.length === 0) {
    throw new Error("No search adapters registered");
  }

  // Initialize repositories
  const searchRepository = new SearchAdapterRepository(searchAdapters[0]);
  const queryClassifierService = new QueryClassifierService();
  const classifierAdapter = new QueryClassifierAdapter(queryClassifierService);

  return {
    cache: cacheRepository,
    search: searchRepository,
    classifier: classifierAdapter,
  };
}
