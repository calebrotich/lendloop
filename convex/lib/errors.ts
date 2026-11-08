import { ConvexError } from "convex/values";

/**
 * Machine-readable error codes. The UI maps these to copy; it never decides
 * access, and the server never leaks a stack trace or an internal message.
 */
export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CONFLICT",
  "VALIDATION",
  "NOT_FOUND",
  "UNAVAILABLE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Throw a typed application error. Returning `never` lets callers rely on
 * control-flow narrowing, e.g. `if (!identity) appError(...)`.
 */
export function appError(code: ErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}
