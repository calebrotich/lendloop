/**
 * Turn a thrown Convex error into copy a person can act on.
 *
 * Duck-typed rather than `instanceof ConvexError`: the ConvexError class can be
 * loaded twice (server bundle and client bundle), and an identity check across
 * those copies silently fails.
 */
export function appErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const { data } = error as { data?: unknown };
    if (typeof data === "object" && data !== null) {
      const { message } = data as { message?: unknown };
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }
  }
  return fallback;
}

/** Machine-readable code from a ConvexError, for branching in the UI. */
export function appErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "data" in error) {
    const { data } = error as { data?: unknown };
    if (typeof data === "object" && data !== null) {
      const { code } = data as { code?: unknown };
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}
