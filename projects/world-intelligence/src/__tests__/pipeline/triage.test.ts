import { describe, it, expect, vi, beforeEach } from 'vitest'
import { triageCategory, synthesizeReport, type ScoredItem } from '../../../lib/pipeline'
import type { FeedItem } from '../../../lib/feeds'
import type { LLMConfig } from '../../../lib/llm'

// Mock llm module
vi.mock('../../../lib/llm', () => ({
  callLLM: vi.fn(),
  estimateCost: vi.fn().mockReturnValue(0.01),
}))

// Mock feeds module
vi.mock('../../../lib/feeds', () => ({
  fetchFullArticle: vi.fn().mockResolvedValue('Full article text here'),
}))

const mockItems: FeedItem[] = [
  { title: 'Major Conflict Erupts', description: 'Fighting intensified today', url: 'https://example.com/1', pubDate: '2026-03-04', category: 'geopolitics' },
  { title: 'Markets Rise', description: 'Stock markets up 2%', url: 'https://example.com/2', pubDate: '2026-03-04', category: 'economics' },
  { title: 'New AI Model Released', description: 'A new frontier model', url: 'https://example.com/3', pubDate: '2026-03-04', category: 'technology' },
]

const triagedJson = JSON.stringify([
  { url: 'https://example.com/1', relevanceScore: 9, noveltyScore: 8, importanceScore: 9 },
  { url: 'https://example.com/2', relevanceScore: 6, noveltyScore: 5, importanceScore: 6 },
  { url: 'https://example.com/3', relevanceScore: 8, noveltyScore: 9, importanceScore: 8 },
])

const triageConfig: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  fallbacks: [],
  apiKey: 'test-key',
}

describe('triageCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns scored items with scores merged onto feed items', async () => {
    const { callLLM } = await import('../../../lib/llm')
    vi.mocked(callLLM).mockResolvedValue({
      text: triagedJson,
      inputTokens: 200,
      outputTokens: 80,
    })

    const result = await triageCategory('geopolitics', mockItems, triageConfig)

    expect(result).toHaveLength(3)
    expect(result[0].relevanceScore).toBe(9)
    expect(result[0].importanceScore).toBe(9)
    expect(result[0].title).toBe('Major Conflict Erupts')
  })

  it('fetches full article for items with importanceScore >= 8', async () => {
    const { callLLM } = await import('../../../lib/llm')
    const { fetchFullArticle } = await import('../../../lib/feeds')
    vi.mocked(callLLM).mockResolvedValue({
      text: triagedJson,
      inputTokens: 200,
      outputTokens: 80,
    })

    const result = await triageCategory('geopolitics', mockItems, triageConfig)

    // Items 1 (score 9) and 3 (score 8) should have full article fetched
    const highScoreItems = result.filter(r => r.importanceScore >= 8)
    expect(highScoreItems.length).toBeGreaterThan(0)
    expect(fetchFullArticle).toHaveBeenCalledTimes(2) // items with score 9 and 8
    expect(result.find(r => r.url === 'https://example.com/1')?.fullText).toBe('Full article text here')
  })

  it('handles LLM returning JSON with markdown code block', async () => {
    const { callLLM } = await import('../../../lib/llm')
    vi.mocked(callLLM).mockResolvedValue({
      text: '```json\n' + triagedJson + '\n```',
      inputTokens: 200,
      outputTokens: 80,
    })

    const result = await triageCategory('geopolitics', mockItems, triageConfig)
    expect(result).toHaveLength(3)
  })

  it('returns empty array when LLM returns invalid JSON', async () => {
    const { callLLM } = await import('../../../lib/llm')
    vi.mocked(callLLM).mockResolvedValue({
      text: 'I cannot score these items',
      inputTokens: 50,
      outputTokens: 10,
    })

    const result = await triageCategory('geopolitics', mockItems, triageConfig)
    expect(result).toEqual([])
  })

  it('limits results to itemBudget', async () => {
    const { callLLM } = await import('../../../lib/llm')
    const manyItems = Array.from({ length: 20 }, (_, i) => ({
      title: `Item ${i}`,
      description: `Desc ${i}`,
      url: `https://example.com/${i}`,
      pubDate: '2026-03-04',
      category: 'geopolitics',
    }))
    const manyScored = manyItems.map((item, i) => ({
      url: item.url,
      relevanceScore: 7,
      noveltyScore: 7,
      importanceScore: 7 - (i % 3), // keep scores below 8 to avoid full article fetch
    }))
    vi.mocked(callLLM).mockResolvedValue({
      text: JSON.stringify(manyScored),
      inputTokens: 500,
      outputTokens: 200,
    })

    const result = await triageCategory('geopolitics', manyItems, triageConfig, 5)
    expect(result.length).toBeLessThanOrEqual(5)
  })
})

describe('synthesizeReport', () => {
  const scoredItems: ScoredItem[] = [
    {
      title: 'Major Conflict',
      description: 'Fighting intensified',
      url: 'https://example.com/1',
      pubDate: '2026-03-04',
      category: 'geopolitics',
      relevanceScore: 9,
      noveltyScore: 8,
      importanceScore: 9,
      fullText: 'Full article text',
    },
  ]

  const synthesisConfig: LLMConfig = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    fallbacks: [],
    apiKey: 'test-key',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns body, summary, and costUsd', async () => {
    const { callLLM, estimateCost } = await import('../../../lib/llm')
    vi.mocked(callLLM).mockResolvedValue({
      text: '# World Intelligence Report\n\n## Summary\nKey events today.\n\n## Geopolitics\nMajor conflict erupted.',
      inputTokens: 1000,
      outputTokens: 500,
    })
    vi.mocked(estimateCost).mockReturnValue(0.05)

    const result = await synthesizeReport(scoredItems, synthesisConfig)

    expect(result.body).toContain('# World Intelligence Report')
    expect(result.summary).toBeTruthy()
    expect(typeof result.costUsd).toBe('number')
    expect(result.costUsd).toBe(0.05)
  })

  it('extracts summary from first paragraph if no explicit Summary section', async () => {
    const { callLLM } = await import('../../../lib/llm')
    vi.mocked(callLLM).mockResolvedValue({
      text: 'Today was significant. Many events happened globally.',
      inputTokens: 100,
      outputTokens: 50,
    })

    const result = await synthesizeReport(scoredItems, synthesisConfig)
    expect(result.summary).toBeTruthy()
    expect(result.summary.length).toBeGreaterThan(5)
  })

  it('synthesis prompt requests all 6 report sections', async () => {
    const { callLLM } = await import('../../../lib/llm')
    let capturedPrompt = ''
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return { text: '# Report\n\n## Executive Summary\nTest.', inputTokens: 100, outputTokens: 50 }
    })

    await synthesizeReport(scoredItems, synthesisConfig)

    expect(capturedPrompt).toContain('Executive Summary')
    expect(capturedPrompt).toContain('Key Themes')
    expect(capturedPrompt).toContain('Critical Events')
    expect(capturedPrompt).toContain('Opportunities')
    expect(capturedPrompt).toContain('Contrarian Angles')
    expect(capturedPrompt).toContain('Coverage Gaps')
  })

  it('synthesis prompt uses domain-neutral intelligence analyst persona', async () => {
    const { callLLM } = await import('../../../lib/llm')
    let capturedPrompt = ''
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return { text: '# Report\n\n## Executive Summary\nTest.', inputTokens: 100, outputTokens: 50 }
    })

    await synthesizeReport(scoredItems, synthesisConfig)

    expect(capturedPrompt.toLowerCase()).toContain('intelligence analyst')
    expect(capturedPrompt.toLowerCase()).not.toContain('high-yield')
    expect(capturedPrompt.toLowerCase()).not.toContain('credit spread')
  })

  it('synthesis prompt requests report header with metadata', async () => {
    const { callLLM } = await import('../../../lib/llm')
    let capturedPrompt = ''
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return { text: '# Report\n\n## 1. Executive Summary\nTest.', inputTokens: 100, outputTokens: 50 }
    })

    await synthesizeReport(scoredItems, synthesisConfig)

    // Prompt should include header metadata
    expect(capturedPrompt).toMatch(/World Intelligence Report/)
    expect(capturedPrompt.toLowerCase()).toMatch(/categor/)
    expect(capturedPrompt.toLowerCase()).toMatch(/articles?\s+reviewed|items?\s+reviewed/)
  })
})

describe('triageCategory prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triage prompt requests contrarian_signal boolean field', async () => {
    const { callLLM } = await import('../../../lib/llm')
    let capturedPrompt = ''
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return { text: JSON.stringify([
        { url: 'https://example.com/1', relevanceScore: 7, noveltyScore: 6, importanceScore: 7, contrarian_signal: false },
      ]), inputTokens: 100, outputTokens: 50 }
    })

    await triageCategory('geopolitics', [mockItems[0]], triageConfig)

    expect(capturedPrompt).toContain('contrarian_signal')
  })
})
