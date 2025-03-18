import { err, ok, Result } from "neverthrow";
import { QueryParams, SearchError, SearchResponse, SearchResult } from "../../models/search.ts";
import { CacheAdapter } from "../cache/cacheAdapter.ts";
import { createSearchCacheKey, SearchAdapter } from "./searchAdapter.ts";
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

      return cacheResult.match(
        (cachedValue) => cachedValue ? ok(cachedValue) : this.executeSearch(params),
        () => this.executeSearch(params),
      );
    }

    return this.executeSearch(params);
  }

  getRelevanceScore(_query: string, category: QueryCategory): number {
    const categoryScores: Record<Partial<QueryCategory>, number> = {
      "qa": 0.95,
      "programming": 0.9,
      "technical": 0.8,
      "general": 0.7,
      "web3": 0.7,
      "academic": 0.7,
    };

    return categoryScores[category] ?? 0.3;
  }

  private async executeSearch(
    params: QueryParams,
  ): Promise<Result<SearchResponse, SearchError>> {
    const startTime = Date.now();

    const searchParams: StackExchangeSearchParams = {
      intitle: params.q,
      site: this.site,
      pagesize: params.maxResults,
      sort: "relevance",
      order: "desc",
    };

    if (this.apiKey) {
      searchParams.key = this.apiKey;
    }

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

    const responseResult = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
      },
    })
      .then((response) => ok(response))
      .catch((error) =>
        err<Response, SearchError>({
          type: "network",
          message: error instanceof Error
            ? error.message
            : "Unknown error fetching Stack Exchange data",
        })
      );

    if (responseResult.isErr()) {
      return err(responseResult.error);
    }

    const response = responseResult.value;

    if (!response.ok) {
      if (response.status === 400) {
        return err({
          type: "invalidQuery",
          message: "Invalid query format for Stack Exchange API",
          issues: ["Invalid query format for Stack Exchange API"],
        });
      }

      if (response.status === 429) {
        return err({
          type: "rateLimit",
          message: "Stack Exchange API rate limit exceeded",
          retryAfterMs: 60000, // Default to 1 minute
        });
      }

      return err({
        type: "network",
        message: `Stack Exchange API error: ${response.status} ${response.statusText}`,
      });
    }

    const dataResult = await response.json()
      .then((data) => ok(data as StackExchangeResponse))
      .catch((error) =>
        err<StackExchangeResponse, SearchError>({
          type: "network",
          message: error instanceof Error
            ? `Failed to parse Stack Exchange response: ${error.message}`
            : "Failed to parse Stack Exchange response",
        })
      );

    if (dataResult.isErr()) {
      return err(dataResult.error);
    }

    const data = dataResult.value;

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
      const cacheResult = await this.cache.set(cacheKey, searchResponse, DEFAULT_CACHE_TTL_MS)
        .then(() => ok(undefined))
        .catch((error) =>
          err<undefined, SearchError>({
            type: "network",
            message: error instanceof Error
              ? error.message
              : "Failed to cache Stack Exchange results",
          })
        );

      if (cacheResult.isErr()) {
        console.error(`Failed to cache Stack Exchange results: ${cacheResult.error.message}`);
      }
    }

    return ok(searchResponse);
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
