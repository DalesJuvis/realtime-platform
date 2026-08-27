/**
 * # AppError
 *
 * Typed application error propagated from action files. Wraps the backend's
 * `{ success: false, error: { code, message, trace_id } }` envelope (see
 * `AppError` in the Rust backend's `src/error.rs`) into a JS Error subclass.
 *
 * Fields are declared and assigned explicitly (not via constructor parameter
 * properties) — TypeScript 6's `erasableSyntaxOnly` disallows parameter
 * properties since they generate runtime assignment code, not just erasable
 * type annotations.
 */

export class AppError extends Error {
  readonly code: string
  readonly traceId: string | undefined

  constructor(code: string, message: string, traceId?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.traceId = traceId
  }
}

export type AppErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

/** Narrows an unknown catch-clause error into a user-facing message. */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof AppError) return err.message
  if (err instanceof Error) return err.message
  return fallback
}
