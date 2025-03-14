import { Result } from "neverthrow";

/**
 * Safe error extractor for Result types - works with Result from neverthrow
 * This is a utility function to extract errors from Result objects in a type-safe way
 * without triggering TypeScript errors about accessing non-existent properties.
 */
export function getErrorSafe<T, E>(result: Result<T, E>): E | undefined {
  if (result.isErr()) {
    // Using _unsafeUnwrapErr is safe here because we've checked isErr()
    return result._unsafeUnwrapErr();
  }
  return undefined;
}

/**
 * Safe value extractor for Result types - works with Result from neverthrow
 * This is a utility function to extract values from Result objects in a type-safe way
 * without triggering TypeScript errors about accessing non-existent properties.
 */
export function getValueSafe<T, E>(result: Result<T, E>): T | undefined {
  if (result.isOk()) {
    // Using _unsafeUnwrap is safe here because we've checked isOk()
    return result._unsafeUnwrap();
  }
  return undefined;
}
