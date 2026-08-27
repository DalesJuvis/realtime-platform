/**
 * # AppError
 *
 * Wraps the backend's `{ success: false, error: { code, message, trace_id } }`
 * envelope (`modules::portal::dto::ApiEnvelope` in the Rust backend) into a
 * JS Error subclass.
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

export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof AppError) return err.message
  if (err instanceof Error) return err.message
  return fallback
}
