import { describe, expect, it } from 'vitest'
import { cn, formatAmount, formatDate, formatDateTime } from './utils'

describe('cn', () => {
  it('merges class lists and resolves conflicting utilities', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    const isHidden = false
    expect(cn('text-sm', isHidden && 'hidden', 'font-medium')).toBe('text-sm font-medium')
  })
})

describe('formatAmount', () => {
  it('formats zero-decimal currencies as whole units', () => {
    expect(formatAmount(10000, 'XOF')).toBe('10,000 XOF')
    expect(formatAmount(1500000, 'XAF')).toBe('1,500,000 XAF')
  })

  it('formats standard currencies by dividing smallest-unit amount by 100', () => {
    expect(formatAmount(150000, 'USD')).toBe('1,500.00 USD')
    expect(formatAmount(99, 'EUR')).toBe('0.99 EUR')
  })
})

describe('formatDateTime / formatDate', () => {
  const iso = '2026-03-05T14:30:00.000Z'

  it('produces a non-empty, locale-formatted string', () => {
    expect(formatDateTime(iso).length).toBeGreaterThan(0)
    expect(formatDate(iso).length).toBeGreaterThan(0)
  })

  it('formatDate omits the time portion that formatDateTime includes', () => {
    expect(formatDateTime(iso)).not.toBe(formatDate(iso))
  })
})
