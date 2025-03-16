/**
 * Defines categories for query routing to different search adapters
 */
export type QueryCategory = "general" | "programming" | "web3" | "academic" | "technical" | "qa";

/**
 * Defines search adapter selection and routing settings
 */
export interface RoutingOptions {
  readonly category?: QueryCategory;
  readonly forceAdapter?: string;
  readonly parallel?: boolean;
  readonly mergeResults?: boolean;
}

/**
 * API Usage tracking information
 */
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
