import { describe, it, expect } from 'vitest'
import { formatAmount, parseAmount, limitLevel } from '../types'

describe('formatAmount', () => {
  it('converts fen to yuan with 2 decimals', () => {
    expect(formatAmount(100)).toBe('1.00')
    expect(formatAmount(1)).toBe('0.01')
    expect(formatAmount(0)).toBe('0.00')
    expect(formatAmount(12345)).toBe('123.45')
  })

  it('handles negative amounts', () => {
    expect(formatAmount(-500)).toBe('-5.00')
  })

  it('handles large amounts', () => {
    expect(formatAmount(2_000_000_000)).toBe('20000000.00')
  })
})

describe('parseAmount', () => {
  it('converts yuan string to fen integer', () => {
    expect(parseAmount('1')).toBe(100)
    expect(parseAmount('0.01')).toBe(1)
    expect(parseAmount('123.45')).toBe(12345)
    expect(parseAmount('0')).toBe(0)
  })

  it('rounds to avoid floating-point issues', () => {
    expect(parseAmount('0.1')).toBe(10)
    expect(parseAmount('1.005')).toBe(100)
  })

  it('returns NaN for non-numeric input', () => {
    expect(parseAmount('abc')).toBeNaN()
  })
})

describe('limitLevel', () => {
  it('returns exhausted when remaining <= 200 yuan', () => {
    expect(limitLevel(200 * 100)).toBe('exhausted')
    expect(limitLevel(100 * 100)).toBe('exhausted')
    expect(limitLevel(0)).toBe('exhausted')
  })

  it('returns warning when remaining < 2000 yuan', () => {
    expect(limitLevel(1999 * 100)).toBe('warning')
    expect(limitLevel(201 * 100)).toBe('warning')
  })

  it('returns normal when remaining >= 2000 yuan', () => {
    expect(limitLevel(2000 * 100)).toBe('normal')
    expect(limitLevel(5000 * 100)).toBe('normal')
  })
})
