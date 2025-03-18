import { DomainError } from "../../../domain/models/errors.ts";
import { getErrorStatusCode } from "../../../domain/models/errors.ts";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export interface ApiErrorResponse<D = unknown, T = unknown> {
  status: "error";
  message: string;
  error?: T;
  data?: D;
}

export function createErrorResponse<D = unknown, T = unknown>(
  message: string,
  error?: T,
  data?: D,
): ApiErrorResponse<D, T> {
  return {
    status: "error",
    message,
    error,
    data,
  };
}

export function domainErrorToResponse<D = unknown>(
  error: DomainError,
  data?: D,
): ApiErrorResponse<D> {
  return createErrorResponse(
    error.message,
    error.details,
    data,
  );
}

export function domainErrorToApiError(error: DomainError): ApiError {
  return new ApiError(
    error.message,
    getErrorStatusCode(error),
    error.details,
  );
}
