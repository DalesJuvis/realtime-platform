/**
 * # http
 *
 * Configured Axios instance for the Admin API. `baseURL` is resolved per
 * request from `AdminAuthStore` (not fixed at instance creation) since the
 * connected engine instance can change without a page reload. Every request
 * gets the stored bearer token — harmless on the unauthenticated `system`
 * segment, required on `admin`.
 *
 * On a 401 from any `/api/v1/admin/*` call, logs out (this backend has no
 * refresh-token flow — a 401 means the stored token is wrong for this
 * instance, or was rotated away).
 */

import axios, { AxiosError, type AxiosResponse } from 'axios'
import { AppError } from './errors'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import { useAdminAuthStore } from '@store/adminAuth.store'

export const http = axios.create({
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const { apiUrl, token } = useAdminAuthStore.getState()
  if (apiUrl) config.baseURL = apiUrl
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? ''
      if (url.startsWith('/api/v1/admin')) {
        useAdminAuthStore.getState().logout()
      }
    }
    return Promise.reject(error)
  },
)

/**
 * Unwraps a `{ success, data }` / `{ success: false, error }` envelope
 * response into its data payload, throwing a typed `AppError` on any
 * failure. Every admin action file should return `apiRequest(http.x(...))`
 * rather than handling `response.data.success` manually. Not used for the
 * two `system` endpoints — those return plain text, not this envelope.
 */
export async function apiRequest<T>(promise: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  try {
    const response = await promise
    if (!response.data.success) {
      throw new AppError(response.data.error.code, response.data.error.message, response.data.error.trace_id)
    }
    return response.data.data
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof AxiosError) {
      const body = err.response?.data as ApiResponse<T> | undefined
      if (body && body.success === false) {
        throw new AppError(body.error.code, body.error.message, body.error.trace_id)
      }
      throw new AppError('NETWORK_ERROR', err.message)
    }
    throw new AppError('UNKNOWN_ERROR', 'An unexpected error occurred.')
  }
}

/**
 * Same error handling as `apiRequest`, for the two admin endpoints that
 * respond `204 No Content` (revoke tenant, set limits) — no envelope body
 * to unwrap, just success-or-throw.
 */
export async function apiRequestVoid(promise: Promise<AxiosResponse<unknown>>): Promise<void> {
  try {
    await promise
  } catch (err) {
    if (err instanceof AxiosError) {
      const body = err.response?.data as ApiResponse<unknown> | undefined
      if (body && body.success === false) {
        throw new AppError(body.error.code, body.error.message, body.error.trace_id)
      }
      throw new AppError('NETWORK_ERROR', err.message)
    }
    throw new AppError('UNKNOWN_ERROR', 'An unexpected error occurred.')
  }
}
