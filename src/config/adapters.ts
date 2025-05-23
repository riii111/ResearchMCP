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
import { err, ok, Result } from "neverthrow";
import { info } from "./logger.ts";

/**
 * Type definition representing the adapter container.
 */
export interface AdapterContainer {
  cache: CacheAdapterRepository;
  search: SearchAdapterRepository[];
  classifier: QueryClassifierAdapter;
}

export type AdapterInitError = {
  type: "no_adapters";
  message: string;
};

/**
 * Initializes and registers adapters.
 * @param apiKeys API keys object.
 * @returns Result with initialized adapter container or error.
 */
export function initializeAdapters(apiKeys: ApiKeys): Result<AdapterContainer, AdapterInitError> {
  const memoryCacheAdapter = new MemoryCacheAdapter();
  const cacheRepository = new CacheAdapterRepository(memoryCacheAdapter);

  registerBraveSearchAdapter(apiKeys.brave, memoryCacheAdapter);
  info("Registered BraveSearchAdapter");

  if (apiKeys.tavily) {
    registerTavilySearchAdapter(apiKeys.tavily, memoryCacheAdapter);
    info("Registered TavilySearchAdapter");
  } else {
    info("Tavily API integration disabled (no API key)");
  }

  registerWikipediaAdapter(memoryCacheAdapter, "ja");
  info("Registered WikipediaAdapter (Japanese)");

  // TODO(@riii111) GitHub API and StackExchange API integration is disabled for now
  // if (apiKeys.github) {
  //   registerGitHubAdapter(apiKeys.github, memoryCacheAdapter);
  //   info("Registered GitHubAdapter");
  // } else {
  //   info("GitHub API integration disabled (no API token)");
  // }

  // registerStackExchangeAdapter(apiKeys.stackExchange, memoryCacheAdapter);
  // info("StackExchange API integration temporarily disabled");

  const searchAdapters = searchAdapterRegistry.getAllAdapters();
  if (searchAdapters.length === 0) {
    return err({
      type: "no_adapters",
      message: "No search adapters registered",
    });
  }

  const searchRepositories = searchAdapters.map(
    (adapter) => new SearchAdapterRepository(adapter),
  );
  const queryClassifierService = new QueryClassifierService();
  const classifierAdapter = new QueryClassifierAdapter(queryClassifierService);

  return ok({
    cache: cacheRepository,
    search: searchRepositories,
    classifier: classifierAdapter,
  });
}
