import { DomainError, DomainErrorType } from "../../../domain/models/errors.ts";
import { getErrorStatusCode } from "../../../domain/models/errors.ts";

/**
 * API error class for HTTP responses
 */
export class ApiError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Common interface for API error responses
 * @template D - Type of response data
 * @template E - Type of error details
 */
export interface ApiErrorResponse<D = null, E = Record<string, unknown>> {
  status: "error";
  message: string;
  error?: E;
  data?: D;
}

export function createErrorResponse<D = null, E = Record<string, unknown>>(
  message: string,
  error?: E,
  data?: D,
): ApiErrorResponse<D, E> {
  return {
    status: "error",
    message,
    error,
    data,
  };
}

export function domainErrorToResponse<D = null>(
  error: DomainError,
  data?: D,
): ApiErrorResponse<D, { type: DomainErrorType } & Record<string, unknown>> {
  const errorDetails = {
    type: error.type,
    ...(error.details as Record<string, unknown> || {}),
  };

  return createErrorResponse<D, typeof errorDetails>(
    error.message,
    errorDetails,
    data,
  );
}

export function domainErrorToApiError(error: DomainError): ApiError {
  return new ApiError(
    error.message,
    getErrorStatusCode(error),
    { type: error.type, ...(error.details as Record<string, unknown> || {}) },
  );
}
