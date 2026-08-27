/**
 * # http
 *
 * Configured Axios instance for the Portal API. `baseURL` is resolved per
 * request from `portalAuth.store` (not fixed at instance creation) since
 * the connected engine instance can change without a page reload.
 */

import axios, { AxiosError, type AxiosResponse } from 'axios'
import { AppError } from './errors'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import { usePortalAuthStore } from '@store/portalAuth.store'

export const http = axios.create({
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const { apiUrl, accessToken } = usePortalAuthStore.getState()
  if (apiUrl) config.baseURL = apiUrl
  if (accessToken) config.headers['Authorization'] = `Bearer ${accessToken}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      usePortalAuthStore.getState().logout()
    }
    return Promise.reject(error)
  },
)

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
