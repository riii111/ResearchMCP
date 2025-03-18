import { Result } from "neverthrow";
import { QueryCategory } from "../../../domain/models/routing.ts";
import { QueryClassifierService } from "../../../domain/services/queryClassifier.ts";
import {
  ClassificationError,
  QueryClassifierPort,
} from "../../../application/ports/out/QueryClassifierPort.ts";

/**
 * Adapter that converts QueryClassifierService to QueryClassifierPort
 */
export class QueryClassifierAdapter implements QueryClassifierPort {
  constructor(private readonly service: QueryClassifierService) {}

  classifyQuery(query: string): Result<QueryCategory, ClassificationError> {
    return this.service.classifyQuery(query);
  }
}
