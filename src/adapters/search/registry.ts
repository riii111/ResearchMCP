import { err, ok, Result } from "neverthrow";
import { SearchAdapter } from "./searchAdapter.ts";
import { QueryCategory } from "../../models/routing.ts";

/**
 * Registry for search adapters, manages adapter registration and selection
 */
export class SearchAdapterRegistry {
  private adapters = new Map<string, SearchAdapter>();
  
  /**
   * Register a search adapter with the registry
   */
  register(adapter: SearchAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }
  
  /**
   * Get a search adapter by its ID
   */
  getAdapter(id: string): Result<SearchAdapter, Error> {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      return err(new Error(`Adapter with id ${id} not found`));
    }
    return ok(adapter);
  }
  
  /**
   * Get adapters that support a given query category, sorted by relevance score
   */
  getAdaptersForCategory(category: QueryCategory, query: string): SearchAdapter[] {
    const candidates = Array.from(this.adapters.values())
      .filter(adapter => adapter.supportedCategories.includes(category))
      .map(adapter => ({
        adapter,
        score: adapter.getRelevanceScore(query, category)
      }))
      .sort((a, b) => b.score - a.score);
    
    return candidates.map(c => c.adapter);
  }
  
  /**
   * Get all registered adapters
   */
  getAllAdapters(): SearchAdapter[] {
    return Array.from(this.adapters.values());
  }
}

// Singleton instance of the registry
export const searchAdapterRegistry = new SearchAdapterRegistry();