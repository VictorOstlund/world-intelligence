import { describe, it, expect } from 'vitest'
import { estimateCost } from '../../../lib/llm'

describe('estimateCost — new Gemini and Haiku models', () => {
  it('returns non-zero cost for gemini-2.5-flash', () => {
    const cost = estimateCost('gemini', 'gemini-2.5-flash', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })

  it('returns non-zero cost for gemini-3.1-pro', () => {
    const cost = estimateCost('gemini', 'gemini-3.1-pro', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })

  it('returns non-zero cost for gemini-3.1-flash-lite-preview', () => {
    const cost = estimateCost('gemini', 'gemini-3.1-flash-lite-preview', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })

  it('returns non-zero cost for gemini-3.1-flash-lite', () => {
    const cost = estimateCost('gemini', 'gemini-3.1-flash-lite', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })

  it('returns non-zero cost for gemini-2.5-flash-lite', () => {
    const cost = estimateCost('gemini', 'gemini-2.5-flash-lite', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })

  it('returns non-zero cost for claude-haiku-3-5', () => {
    const cost = estimateCost('anthropic', 'claude-haiku-3-5', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })
})
