import { describe, expect, it } from 'vitest'
import { AppError, errorMessage } from './errors'

describe('AppError', () => {
  it('carries code, message, and an optional trace id', () => {
    const err = new AppError('NOT_FOUND', 'Tenant not found.', 'trace-123')
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('Tenant not found.')
    expect(err.traceId).toBe('trace-123')
    expect(err.name).toBe('AppError')
  })

  it('leaves traceId undefined when not provided', () => {
    const err = new AppError('VALIDATION_ERROR', 'Invalid amount.')
    expect(err.traceId).toBeUndefined()
  })
})

describe('errorMessage', () => {
  it('returns the message of an AppError', () => {
    expect(errorMessage(new AppError('CONFLICT', 'Already exists.'))).toBe('Already exists.')
  })

  it('returns the message of a plain Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('falls back to the provided default for non-Error values', () => {
    expect(errorMessage('a string', 'fallback message')).toBe('fallback message')
    expect(errorMessage(null)).toBe('Something went wrong.')
  })
})
