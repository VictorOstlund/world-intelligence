import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callLLM, estimateCost, type LLMConfig } from '../../../lib/llm'

// Mock all provider SDKs
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Anthropic response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}))

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'OpenAI response' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      },
    },
  })),
}))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => 'Gemini response',
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
        },
      }),
    }),
  })),
}))

describe('callLLM', () => {
  const baseConfig: LLMConfig = {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    fallbacks: [],
    apiKey: 'test-key',
  }

  it('calls Anthropic and returns text + tokens', async () => {
    const result = await callLLM('hello', baseConfig)
    expect(result.text).toBe('Anthropic response')
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it('calls OpenAI and returns text + tokens', async () => {
    const config: LLMConfig = { ...baseConfig, provider: 'openai', model: 'gpt-4o-mini' }
    const result = await callLLM('hello', config)
    expect(result.text).toBe('OpenAI response')
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it('calls Gemini and returns text + tokens', async () => {
    const config: LLMConfig = { ...baseConfig, provider: 'gemini', model: 'gemini-1.5-flash-8b' }
    const result = await callLLM('hello', config)
    expect(result.text).toBe('Gemini response')
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it('throws on unknown provider', async () => {
    const config: LLMConfig = { ...baseConfig, provider: 'unknown' as any }
    await expect(callLLM('hello', config)).rejects.toThrow(/unknown provider/i)
  })

  it('advances to fallback model on 429 rate limit error', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const mockCreate = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limit'), { status: 429 }))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Fallback response' }],
        usage: { input_tokens: 50, output_tokens: 25 },
      })
    ;(Anthropic as any).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))

    const config: LLMConfig = {
      ...baseConfig,
      fallbacks: [{ provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'test-key' }],
    }
    const result = await callLLM('hello', config)
    expect(result.text).toBe('Fallback response')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('advances to fallback on 5xx server error', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const mockCreate = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 500 }))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Fallback 5xx' }],
        usage: { input_tokens: 50, output_tokens: 25 },
      })
    ;(Anthropic as any).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))

    const config: LLMConfig = {
      ...baseConfig,
      fallbacks: [{ provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'test-key' }],
    }
    const result = await callLLM('hello', config)
    expect(result.text).toBe('Fallback 5xx')
  })

  it('throws after all fallbacks exhausted', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const mockCreate = vi.fn()
      .mockRejectedValue(Object.assign(new Error('rate limit'), { status: 429 }))
    ;(Anthropic as any).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))

    const config: LLMConfig = {
      ...baseConfig,
      fallbacks: [{ provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'test-key' }],
    }
    await expect(callLLM('hello', config)).rejects.toThrow()
  })

  it('does NOT retry on non-retryable error (400 bad request)', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const mockCreate = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Should not reach fallback' }],
        usage: { input_tokens: 50, output_tokens: 25 },
      })
    ;(Anthropic as any).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))

    const config: LLMConfig = {
      ...baseConfig,
      fallbacks: [{ provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'test-key' }],
    }
    await expect(callLLM('hello', config)).rejects.toThrow('bad request')
    // Must only have been called once — 400 is not retryable, no fallback advance
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})

describe('estimateCost', () => {
  it('calculates Anthropic Haiku cost', () => {
    const cost = estimateCost('anthropic', 'claude-haiku-4-5', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(10) // sanity: haiku is cheap
  })

  it('calculates OpenAI GPT-4o cost', () => {
    const cost = estimateCost('openai', 'gpt-4o', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })

  it('calculates Gemini Flash Lite cost', () => {
    const cost = estimateCost('gemini', 'gemini-1.5-flash-8b', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
  })

  it('returns 0 for unknown model', () => {
    const cost = estimateCost('anthropic', 'unknown-model-xyz', 100, 100)
    expect(cost).toBe(0)
  })
})
