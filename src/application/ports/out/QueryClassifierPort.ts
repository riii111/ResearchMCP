import { Result } from "neverthrow";
import { QueryCategory } from "../../../domain/models/routing.ts";

/**
 * Output port for query classification
 * Defines the interface for query classification operations that the application needs
 */
export interface QueryClassifierPort {
  classifyQuery(query: string): Result<QueryCategory, ClassificationError>;
}

/**
 * Classification error type
 */
export type ClassificationError = Error;
