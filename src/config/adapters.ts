import { CacheAdapterRepository } from "../adapters/out/cache/CacheAdapterRepository.ts";
import { SearchAdapterRepository } from "../adapters/out/search/SearchAdapterRepository.ts";
import { QueryClassifierAdapter } from "../adapters/out/search/QueryClassifierAdapter.ts";
import { MemoryCacheAdapter } from "../adapters/out/cache/MemoryCacheAdapter.ts";
import { registerBraveSearchAdapter } from "../adapters/out/search/BraveSearchAdapter.ts";
import { registerTavilySearchAdapter } from "../adapters/out/search/TavilySearchAdapter.ts";
import { registerWikipediaAdapter } from "../adapters/out/search/WikipediaAdapter.ts";
import { searchAdapterRegistry } from "../adapters/out/search/Registry.ts";
import { QueryClassifierService } from "../domain/services/queryClassifier.ts";
// import { registerGitHubAdapter } from "../adapters/out/search/GithubAdapter.ts";
// import { registerStackExchangeAdapter } from "../adapters/out/search/StackExchangeAdapter.ts";
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

  const memoryCacheAdapter = new MemoryCacheAdapter();
  const cacheRepository = new CacheAdapterRepository(memoryCacheAdapter);

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

  const searchAdapters = searchAdapterRegistry.getAllAdapters();
  if (searchAdapters.length === 0) {
    throw new Error("No search adapters registered");
  }

  const searchRepository = new SearchAdapterRepository(searchAdapters[0]);
  const queryClassifierService = new QueryClassifierService();
  const classifierAdapter = new QueryClassifierAdapter(queryClassifierService);

  return {
    cache: cacheRepository,
    search: searchRepository,
    classifier: classifierAdapter,
  };
}
