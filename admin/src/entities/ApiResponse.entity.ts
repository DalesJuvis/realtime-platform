/**
 * # ApiResponse
 *
 * Universal envelope matching the real backend's response contract exactly
 * (`backend/src/modules/admin/dto/ApiEnvelope.rs`). No pagination exists
 * anywhere in this API — every admin endpoint acts on a single tenant by ID.
 */

export interface ApiSuccess<T> {
  readonly success: true
  readonly data: T
  readonly trace_id: string
}

export interface ApiErrorBody {
  readonly success: false
  readonly error: {
    readonly code: string
    readonly message: string
    readonly trace_id: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody
