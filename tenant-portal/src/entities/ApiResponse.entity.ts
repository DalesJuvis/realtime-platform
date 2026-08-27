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
