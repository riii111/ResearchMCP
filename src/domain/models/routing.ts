export type QueryCategory = "general" | "programming" | "web3" | "academic" | "technical" | "qa";

export interface RoutingOptions {
  readonly category?: QueryCategory;
  readonly mergeResults?: boolean;
}

export interface ApiUsage {
  readonly id: string;
  readonly count: number;
  readonly lastUsed: Date;
  readonly rateLimit?: {
    readonly limit: number;
    readonly remaining: number;
    readonly reset: Date;
  };
}
