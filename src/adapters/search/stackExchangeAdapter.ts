import { err, ok, Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../../models/search.ts";
import { CacheAdapter } from "../cache/cacheAdapter.ts";
import { createSearchCacheKey, SearchAdapter } from "./searchAdapter.ts";
import { getValueSafe } from "../../utils/resultUtils.ts";
import { QueryCategory } from "../../models/routing.ts";
import { searchAdapterRegistry } from "./registry.ts";

interface StackExchangeSearchParams {
  intitle: string;
  site: string;
  pagesize?: number;
  page?: number;
  sort?: "activity" | "votes" | "creation" | "relevance";
  order?: "desc" | "asc";
  tagged?: string;
  key?: string;
}

interface StackExchangeQuestionOwner {
  account_id: number;
  reputation: number;
  user_id: number;
  user_type: string;
  profile_image: string;
  display_name: string;
  link: string;
}

interface StackExchangeQuestion {
  question_id: number;
  title: string;
  link: string;
  tags: string[];
  owner: StackExchangeQuestionOwner;
  is_answered: boolean;
  view_count: number;
  answer_count: number;
  score: number;
  creation_date: number;
  last_activity_date: number;
  content_license?: string;
  accepted_answer_id?: number;
}

interface StackExchangeResponse {
  items: StackExchangeQuestion[];
  has_more: boolean;
  quota_max: number;
  quota_remaining: number;
}

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_SITE = "stackoverflow";
const STACK_EXCHANGE_API_URL = "https://api.stackexchange.com/2.3/search";

export class StackExchangeAdapter implements SearchAdapter {
  readonly id = "stackexchange";
  readonly name = "Stack Exchange";
  readonly supportedCategories: ReadonlyArray<QueryCategory> = [
    "programming",
    "technical",
    "qa",
  ];

  constructor(
    private readonly apiKey?: string,
    private readonly cache?: CacheAdapter,
    private readonly site: string = DEFAULT_SITE,
  ) {}

  async search(params: QueryParams): Promise<Result<SearchResponse, SearchError>> {
    if (this.cache) {
      const cacheKey = createSearchCacheKey(params, this.id);
      const cacheResult = await this.cache.get<SearchResponse>(cacheKey);

      if (cacheResult.isOk()) {
        const cachedValue = getValueSafe(cacheResult);
        if (cachedValue) {
          return ok(cachedValue);
        }
      }
    }

    return await this.executeSearch(params);
  }

  getRelevanceScore(_query: string, category: QueryCategory): number {
    if (category === "qa") {
      return 0.95;
    }

    if (category === "programming") {
      return 0.9;
    }

    if (category === "technical") {
      return 0.8;
    }

    return 0.3;
  }

  private async executeSearch(
    params: QueryParams,
  ): Promise<Result<SearchResponse, SearchError>> {
    const startTime = Date.now();

    try {
      // Use the query as intitle search parameter
      const searchParams: StackExchangeSearchParams = {
        intitle: params.q,
        site: this.site,
        pagesize: params.maxResults,
        sort: "relevance",
        order: "desc",
      };

      // Add API key if available
      if (this.apiKey) {
        searchParams.key = this.apiKey;
      }

      // Add tag filtering if the query contains specific tags
      const tags = this.extractPossibleTags(params.q);
      if (tags.length > 0) {
        searchParams.tagged = tags.join(";");
      }

      const url = new URL(STACK_EXCHANGE_API_URL);
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });

      const response = await fetch(url.toString(), {
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 400) {
          return err({
            type: "invalidQuery",
            issues: ["Invalid query format for Stack Exchange API"],
          });
        }

        if (response.status === 429) {
          return err({
            type: "rateLimit",
            retryAfterMs: 60000, // Default to 1 minute
          });
        }

        return err({
          type: "network",
          message: `Stack Exchange API error: ${response.status} ${response.statusText}`,
        });
      }

      const data = await response.json() as StackExchangeResponse;

      // Check if we're nearly out of quota
      if (data.quota_remaining < 5) {
        console.error(
          `StackExchange API quota is low: ${data.quota_remaining}/${data.quota_max} remaining`,
        );
      }

      const results: SearchResult[] = data.items.map((question, index) => {
        const formattedTags = question.tags.map((tag) => `[${tag}]`).join(" ");

        // Compute a relevance score based on question score and answer count
        // Higher scores and more answers = higher relevance
        const relevanceScore = Math.min(
          0.95,
          0.5 + (question.score / 100) * 0.2 + (question.answer_count > 0 ? 0.2 : 0) +
            (question.is_answered ? 0.1 : 0) + (question.accepted_answer_id ? 0.2 : 0),
        );

        return {
          id: `stackexchange-${question.question_id}`,
          title: question.title,
          url: question.link,
          snippet: `${formattedTags} - Score: ${question.score}, Answers: ${question.answer_count}${
            question.is_answered ? " [ANSWERED]" : ""
          }${question.accepted_answer_id ? " [ACCEPTED]" : ""}`,
          published: new Date(question.creation_date * 1000),
          rank: index + 1,
          source: `${this.name} (${this.site})`,
          sourceType: "qa",
          relevanceScore,
        };
      });

      const searchResponse: SearchResponse = {
        query: params,
        results,
        totalResults: results.length, // Stack Exchange doesn't provide total count
        searchTime: Date.now() - startTime,
        source: this.id,
      };

      if (this.cache) {
        const cacheKey = createSearchCacheKey(params, this.id);
        await this.cache.set(cacheKey, searchResponse, DEFAULT_CACHE_TTL_MS);
      }

      return ok(searchResponse);
    } catch (error) {
      return err({
        type: "network",
        message: error instanceof Error ? error.message : "Unknown Stack Exchange API error",
      });
    }
  }

  /**
   * Extract potential tags from the query string
   * For example, "javascript function in react" might extract ['javascript', 'react']
   */
  private extractPossibleTags(query: string): string[] {
    // Common programming languages and technologies that could be tags
    const commonTags = [
      "javascript",
      "python",
      "java",
      "c#",
      "php",
      "typescript",
      "ruby",
      "swift",
      "kotlin",
      "go",
      "rust",
      "c++",
      "sql",
      "react",
      "angular",
      "vue",
      "node.js",
      "django",
      "flask",
      "spring",
      "express",
      "android",
      "ios",
      "flutter",
      "docker",
      "kubernetes",
      "aws",
      "azure",
      "mongodb",
      "mysql",
      "postgresql",
      "redis",
    ];

    const words = query.toLowerCase().split(/\s+/);
    return words.filter((word) => commonTags.includes(word));
  }
}

export function registerStackExchangeAdapter(
  apiKey?: string,
  cache?: CacheAdapter,
  site: string = DEFAULT_SITE,
): void {
  const adapter = new StackExchangeAdapter(apiKey, cache, site);
  searchAdapterRegistry.register(adapter);
}
