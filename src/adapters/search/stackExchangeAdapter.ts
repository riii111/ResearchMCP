import { err, ok, Result, ResultAsync } from "neverthrow";
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

class SearchResultFactory {
  static createFromQuestion(
    question: StackExchangeQuestion,
    index: number,
    sourceName: string,
    siteName: string,
  ): SearchResult {
    const formattedTags = question.tags.map((tag) => `[${tag}]`).join(" ");

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
      source: `${sourceName} (${siteName})`,
      sourceType: "qa",
      relevanceScore,
    };
  }
}

class StackExchangeRequestBuilder {
  private readonly params: StackExchangeSearchParams;
  private readonly baseUrl: string;
  private readonly commonTags: string[];

  constructor(baseUrl: string = "https://api.stackexchange.com/2.3/search") {
    this.baseUrl = baseUrl;
    this.params = {
      intitle: "",
      site: "stackoverflow",
      sort: "relevance",
      order: "desc",
    };

    // List of common programming languages and technology tags
    this.commonTags = [
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
  }

  withQuery(query: string): StackExchangeRequestBuilder {
    this.params.intitle = query;
    return this;
  }

  withSite(site: string): StackExchangeRequestBuilder {
    this.params.site = site;
    return this;
  }

  withMaxResults(maxResults?: number): StackExchangeRequestBuilder {
    if (maxResults !== undefined) {
      this.params.pagesize = maxResults;
    }
    return this;
  }

  withApiKey(apiKey?: string): StackExchangeRequestBuilder {
    if (apiKey !== undefined) {
      this.params.key = apiKey;
    }
    return this;
  }

  withAutoTags(query: string): StackExchangeRequestBuilder {
    const tags = this.extractPossibleTags(query);
    if (tags.length > 0) {
      this.params.tagged = tags.join(";");
    }
    return this;
  }

  build(): URL {
    const url = new URL(this.baseUrl);
    Object.entries(this.params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
    return url;
  }

  private extractPossibleTags(query: string): string[] {
    const words = query.toLowerCase().split(/\s+/);
    return words.filter((word) => this.commonTags.includes(word));
  }
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

    const dataResult = await this.fetchStackExchangeData(params);
    if (dataResult.isErr()) {
      return err(dataResult.error);
    }

    const searchResponse = this.transformToSearchResponse(
      params,
      dataResult.value,
      startTime,
    );

    if (this.cache) {
      this.cacheSearchResults(params, searchResponse)
        .then((result) =>
          result.match(
            () => {}, // do nothing on success
            (error) => console.error(`Failed to cache Stack Exchange results: ${error.message}`),
          )
        );
    }

    return ok(searchResponse);
  }

  private fetchStackExchangeData(
    params: QueryParams,
  ): ResultAsync<StackExchangeResponse, SearchError> {
    const requestBuilder = new StackExchangeRequestBuilder(STACK_EXCHANGE_API_URL)
      .withQuery(params.q)
      .withSite(this.site)
      .withMaxResults(params.maxResults)
      .withApiKey(this.apiKey)
      .withAutoTags(params.q);

    const url = requestBuilder.build();

    return ResultAsync.fromPromise(
      fetch(url.toString(), { headers: { "Accept": "application/json" } }),
      (e) => ({
        type: "network",
        message: e instanceof Error ? e.message : "Unknown error fetching Stack Exchange data",
      } as SearchError),
    )
      .andThen((response) => {
        if (!response.ok) {
          if (response.status === 400) {
            return err<Response, SearchError>({
              type: "invalidQuery",
              message: "Invalid query format for Stack Exchange API",
              issues: ["Invalid query format for Stack Exchange API"],
            });
          }
          if (response.status === 429) {
            return err<Response, SearchError>({
              type: "rateLimit",
              message: "Stack Exchange API rate limit exceeded",
              retryAfterMs: 60000,
            });
          }
          return err<Response, SearchError>({
            type: "network",
            message: `Stack Exchange API error: ${response.status} ${response.statusText}`,
          });
        }

        return ok(response);
      })
      .andThen((response) =>
        ResultAsync.fromPromise(
          response.json() as Promise<StackExchangeResponse>,
          (e) => ({
            type: "network",
            message: e instanceof Error
              ? `Failed to parse Stack Exchange response: ${e.message}`
              : "Failed to parse Stack Exchange response",
          } as SearchError),
        )
      );
  }

  private transformToSearchResponse(
    params: QueryParams,
    data: StackExchangeResponse,
    startTime: number,
  ): SearchResponse {
    if (data.quota_remaining < 5) {
      console.error(
        `StackExchange API quota is low: ${data.quota_remaining}/${data.quota_max} remaining`,
      );
    }

    const results: SearchResult[] = data.items.map((question, index) =>
      SearchResultFactory.createFromQuestion(question, index, this.name, this.site)
    );

    return {
      query: params,
      results,
      totalResults: results.length, // Stack Exchange doesn't provide total count
      searchTime: Date.now() - startTime,
      source: this.id,
    };
  }

  private cacheSearchResults(
    params: QueryParams,
    searchResponse: SearchResponse,
  ): Promise<Result<void, SearchError>> {
    const cacheKey = createSearchCacheKey(params, this.id);

    return this.cache!.set(cacheKey, searchResponse, DEFAULT_CACHE_TTL_MS)
      .then(() => ok(undefined))
      .catch((error) =>
        err<void, SearchError>({
          type: "network",
          message: error instanceof Error
            ? error.message
            : "Failed to cache Stack Exchange results",
        })
      );
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
