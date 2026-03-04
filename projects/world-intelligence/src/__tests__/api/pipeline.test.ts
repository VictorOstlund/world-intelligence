import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createMockStore, createMockSql } from '../helpers/mock-neon'

const store = createMockStore()
const mockSql = createMockSql(store)

vi.doMock('@neondatabase/serverless', () => ({
  neon: vi.fn().mockReturnValue(mockSql),
}))

// Mock LLM calls — must be hoisted before imports
vi.mock('../../../lib/llm', () => ({
  callLLM: vi.fn(),
  estimateCost: vi.fn().mockReturnValue(0.02),
}))

// Mock feed fetching — must be hoisted before imports
vi.mock('../../../lib/feeds', () => ({
  loadFeedList: vi.fn(),
  fetchCategory: vi.fn(),
  fetchFullArticle: vi.fn().mockResolvedValue('Full article text'),
}))

// Category names to enable in the test config
const ENABLED_CATS = ['geopolitics', 'economics']

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test'
  process.env.JWT_SECRET = 'test-secret-minimum-32-chars-long!!'

  const { initDb, saveConfig } = await import('../../../lib/db')
  await initDb()

  // Explicitly disable ALL categories except geopolitics and economics.
  const ALL_CAT_NAMES = [
    'geopolitics', 'economics', 'technology', 'climate', 'energy',
    'defense', 'finance', 'health', 'science', 'society', 'media',
    'conflict', 'trade', 'infrastructure', 'emerging-markets',
  ]
  const categoryConfig = Object.fromEntries(
    ALL_CAT_NAMES.map(k => [k, { enabled: ENABLED_CATS.includes(k), itemBudget: 5 }])
  )

  await saveConfig({
    active_provider: 'anthropic',
    triage_model: 'gemini-1.5-flash-8b',
    synthesis_model: 'claude-sonnet-4-6',
    triage_fallbacks: '[]',
    synthesis_fallbacks: '[]',
    schedule_hours: 6,
    category_config: JSON.stringify(categoryConfig),
    providers: JSON.stringify({ anthropic: { apiKey: 'sk-ant-test' } }),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  // Clear seen_articles between tests so dedup doesn't leak across tests
  store.seen_articles.length = 0
})

const triagedJson = JSON.stringify([
  { url: 'https://example.com/1', relevanceScore: 7, noveltyScore: 6, importanceScore: 7 },
])

const synthesisText = '# World Intelligence Report 2026-03-04\n\n## Executive Summary\nKey global events today.\n\n## Geopolitics\nTest event occurred.'

describe('POST /api/pipeline/run', () => {
  it('saves a report to DB and returns reportId on success', async () => {
    const { callLLM, estimateCost } = await import('../../../lib/llm')
    const { loadFeedList, fetchCategory } = await import('../../../lib/feeds')

    vi.mocked(loadFeedList).mockResolvedValue({
      geopolitics: ['https://example.com/feed.rss'],
      economics: ['https://example.com/eco.rss'],
    })
    vi.mocked(fetchCategory).mockResolvedValue([
      { title: 'Test Event', description: 'Something happened', url: 'https://example.com/1', pubDate: '2026-03-04', category: 'geopolitics' },
    ])
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      if (prompt.includes('triage agent')) {
        return { text: triagedJson, inputTokens: 100, outputTokens: 50 }
      }
      return { text: synthesisText, inputTokens: 500, outputTokens: 300 }
    })
    vi.mocked(estimateCost).mockReturnValue(0.02)

    const { POST } = await import('../../../app/api/pipeline/run/route')
    const req = new Request('http://localhost/api/pipeline/run', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('reportId')
    expect(typeof json.reportId).toBe('string')
    expect(json).toHaveProperty('costUsd')
    expect(typeof json.costUsd).toBe('number')
    expect(json).toHaveProperty('itemCount')
    expect(json).toHaveProperty('durationMs')

    // Verify report was persisted to DB
    const { getReport } = await import('../../../lib/db')
    const saved = await getReport(json.reportId)
    expect(saved).not.toBeNull()
    expect(saved?.body).toContain('# World Intelligence Report')
    expect(saved?.summary).toBeTruthy()
    expect(saved?.cost_usd).toBeGreaterThanOrEqual(0)
  })

  it('saved report appears in GET /api/reports list', async () => {
    const { callLLM, estimateCost } = await import('../../../lib/llm')
    const { loadFeedList, fetchCategory } = await import('../../../lib/feeds')

    vi.mocked(loadFeedList).mockResolvedValue({
      geopolitics: ['https://example.com/feed.rss'],
      economics: [],
    })
    vi.mocked(fetchCategory).mockResolvedValue([
      { title: 'Event B', description: 'Another event', url: 'https://example.com/2', pubDate: '2026-03-04', category: 'geopolitics' },
    ])
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      if (prompt.includes('triage agent')) {
        return { text: triagedJson, inputTokens: 100, outputTokens: 50 }
      }
      return { text: synthesisText, inputTokens: 500, outputTokens: 300 }
    })
    vi.mocked(estimateCost).mockReturnValue(0.02)

    const { POST } = await import('../../../app/api/pipeline/run/route')
    const runRes = await POST(new Request('http://localhost/api/pipeline/run', { method: 'POST' }))
    expect(runRes.status).toBe(200)
    const { reportId } = await runRes.json()

    const { GET } = await import('../../../app/api/reports/route')
    const listRes = await GET(new Request('http://localhost/api/reports'))
    expect(listRes.status).toBe(200)
    const { reports } = await listRes.json()
    const ids = reports.map((r: any) => r.id)
    expect(ids).toContain(reportId)
  })

  it('disabled categories produce no fetchCategory calls for that category', async () => {
    const { callLLM, estimateCost } = await import('../../../lib/llm')
    const { loadFeedList, fetchCategory } = await import('../../../lib/feeds')

    // technology is disabled in the config (set in beforeAll)
    vi.mocked(loadFeedList).mockResolvedValue({
      geopolitics: ['https://example.com/feed.rss'],
      economics: ['https://example.com/eco.rss'],
      technology: ['https://example.com/tech.rss'],
    })
    vi.mocked(fetchCategory).mockResolvedValue([
      { title: 'Test Event', description: 'Desc', url: 'https://example.com/1', pubDate: '2026-03-04', category: 'geopolitics' },
    ])
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      if (prompt.includes('triage agent')) {
        return { text: triagedJson, inputTokens: 100, outputTokens: 50 }
      }
      return { text: synthesisText, inputTokens: 500, outputTokens: 300 }
    })
    vi.mocked(estimateCost).mockReturnValue(0.02)

    const { POST } = await import('../../../app/api/pipeline/run/route')
    const res = await POST(new Request('http://localhost/api/pipeline/run', { method: 'POST' }))
    expect(res.status).toBe(200)

    // fetchCategory should NOT be called for "technology" (it's disabled in config)
    const fetchCategoryCalls = vi.mocked(fetchCategory).mock.calls
    const categoriesFetched = fetchCategoryCalls.map((call) => call[0])
    expect(categoriesFetched).not.toContain('technology')
    expect(categoriesFetched).toContain('geopolitics')
    expect(categoriesFetched).toContain('economics')
  })

  it('runs pipeline across ≥5 categories and returns itemCount > 0', async () => {
    const { callLLM, estimateCost } = await import('../../../lib/llm')
    const { loadFeedList, fetchCategory } = await import('../../../lib/feeds')
    const { saveConfig } = await import('../../../lib/db')

    // Enable exactly 5 categories for this test
    const FIVE_CATS = ['geopolitics', 'economics', 'technology', 'climate', 'energy']
    const ALL_CAT_NAMES = [
      'geopolitics', 'economics', 'technology', 'climate', 'energy',
      'defense', 'finance', 'health', 'science', 'society', 'media',
      'conflict', 'trade', 'infrastructure', 'emerging-markets',
    ]
    const categoryConfig = Object.fromEntries(
      ALL_CAT_NAMES.map(k => [k, { enabled: FIVE_CATS.includes(k), itemBudget: 5 }])
    )
    await saveConfig({
      active_provider: 'anthropic',
      triage_model: 'gemini-1.5-flash-8b',
      synthesis_model: 'claude-sonnet-4-6',
      triage_fallbacks: '[]',
      synthesis_fallbacks: '[]',
      schedule_hours: 6,
      category_config: JSON.stringify(categoryConfig),
      providers: JSON.stringify({ anthropic: { apiKey: 'sk-ant-test' } }),
    })

    // Return a feed for each enabled category
    vi.mocked(loadFeedList).mockResolvedValue(
      Object.fromEntries(FIVE_CATS.map(cat => [cat, [`https://example.com/${cat}.rss`]]))
    )
    // Use the same URL as in triagedJson so the score lookup matches
    vi.mocked(fetchCategory).mockImplementation(async (cat: string) => [
      { title: `${cat} Event`, description: 'Something happened', url: 'https://example.com/1', pubDate: '2026-03-04', category: cat },
    ])
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      if (prompt.includes('triage agent')) {
        return { text: triagedJson, inputTokens: 100, outputTokens: 50 }
      }
      return { text: synthesisText, inputTokens: 500, outputTokens: 300 }
    })
    vi.mocked(estimateCost).mockReturnValue(0.02)

    const { POST } = await import('../../../app/api/pipeline/run/route')
    const res = await POST(new Request('http://localhost/api/pipeline/run', { method: 'POST' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.itemCount).toBeGreaterThan(0)

    // Exactly 5 fetchCategory calls — one per enabled category
    const categoriesFetched = vi.mocked(fetchCategory).mock.calls.map((call) => call[0])
    expect(categoriesFetched.length).toBeGreaterThanOrEqual(5)
    for (const cat of FIVE_CATS) {
      expect(categoriesFetched).toContain(cat)
    }
  })

  it('second pipeline run deduplicates previously seen articles', async () => {
    const { callLLM, estimateCost } = await import('../../../lib/llm')
    const { loadFeedList, fetchCategory } = await import('../../../lib/feeds')
    const { saveConfig } = await import('../../../lib/db')

    // Restore 2-category config
    const ALL_CAT_NAMES = [
      'geopolitics', 'economics', 'technology', 'climate', 'energy',
      'defense', 'finance', 'health', 'science', 'society', 'media',
      'conflict', 'trade', 'infrastructure', 'emerging-markets',
    ]
    const categoryConfig = Object.fromEntries(
      ALL_CAT_NAMES.map(k => [k, { enabled: ENABLED_CATS.includes(k), itemBudget: 5 }])
    )
    await saveConfig({
      active_provider: 'anthropic',
      triage_model: 'gemini-1.5-flash-8b',
      synthesis_model: 'claude-sonnet-4-6',
      triage_fallbacks: '[]',
      synthesis_fallbacks: '[]',
      schedule_hours: 6,
      category_config: JSON.stringify(categoryConfig),
      providers: JSON.stringify({ anthropic: { apiKey: 'sk-ant-test' } }),
    })

    vi.mocked(loadFeedList).mockResolvedValue({
      geopolitics: ['https://example.com/feed.rss'],
      economics: ['https://example.com/eco.rss'],
    })
    vi.mocked(fetchCategory).mockResolvedValue([
      { title: 'Test Event', description: 'Something happened', url: 'https://example.com/dedup-1', pubDate: '2026-03-04', category: 'geopolitics' },
    ])
    const dedupTriagedJson = JSON.stringify([
      { url: 'https://example.com/dedup-1', relevanceScore: 7, noveltyScore: 6, importanceScore: 7 },
    ])
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      if (prompt.includes('triage agent')) {
        return { text: dedupTriagedJson, inputTokens: 100, outputTokens: 50 }
      }
      return { text: synthesisText, inputTokens: 500, outputTokens: 300 }
    })
    vi.mocked(estimateCost).mockReturnValue(0.02)

    // First run — items should pass through
    const { POST } = await import('../../../app/api/pipeline/run/route')
    const res1 = await POST(new Request('http://localhost/api/pipeline/run', { method: 'POST' }))
    expect(res1.status).toBe(200)
    const json1 = await res1.json()
    expect(json1.itemCount).toBeGreaterThan(0)

    // Verify articles are now marked as seen
    expect(store.seen_articles.length).toBeGreaterThan(0)
    expect(store.seen_articles.some(a => a.url === 'https://example.com/dedup-1')).toBe(true)

    // Second run — same URLs should be filtered by dedup
    const res2 = await POST(new Request('http://localhost/api/pipeline/run', { method: 'POST' }))
    expect(res2.status).toBe(200)
    const json2 = await res2.json()
    expect(json2.itemCount).toBe(0) // all items deduped
    expect(json2.itemCount).toBeLessThan(json1.itemCount)
  })

  it('item with importanceScore >= 9 bypasses dedup even if seen', async () => {
    const { callLLM, estimateCost } = await import('../../../lib/llm')
    const { loadFeedList, fetchCategory } = await import('../../../lib/feeds')
    const { saveConfig } = await import('../../../lib/db')

    // Restore 2-category config
    const ALL_CAT_NAMES = [
      'geopolitics', 'economics', 'technology', 'climate', 'energy',
      'defense', 'finance', 'health', 'science', 'society', 'media',
      'conflict', 'trade', 'infrastructure', 'emerging-markets',
    ]
    const categoryConfig = Object.fromEntries(
      ALL_CAT_NAMES.map(k => [k, { enabled: ENABLED_CATS.includes(k), itemBudget: 5 }])
    )
    await saveConfig({
      active_provider: 'anthropic',
      triage_model: 'gemini-1.5-flash-8b',
      synthesis_model: 'claude-sonnet-4-6',
      triage_fallbacks: '[]',
      synthesis_fallbacks: '[]',
      schedule_hours: 6,
      category_config: JSON.stringify(categoryConfig),
      providers: JSON.stringify({ anthropic: { apiKey: 'sk-ant-test' } }),
    })

    const breakingUrl = 'https://example.com/breaking-9'
    vi.mocked(loadFeedList).mockResolvedValue({
      geopolitics: ['https://example.com/feed.rss'],
      economics: ['https://example.com/eco.rss'],
    })
    vi.mocked(fetchCategory).mockResolvedValue([
      { title: 'Breaking News', description: 'Critical update', url: breakingUrl, pubDate: '2026-03-04', category: 'geopolitics' },
    ])
    const breakingTriagedJson = JSON.stringify([
      { url: breakingUrl, relevanceScore: 9, noveltyScore: 9, importanceScore: 9 },
    ])
    vi.mocked(callLLM).mockImplementation(async (prompt: string) => {
      if (prompt.includes('triage agent')) {
        return { text: breakingTriagedJson, inputTokens: 100, outputTokens: 50 }
      }
      return { text: synthesisText, inputTokens: 500, outputTokens: 300 }
    })
    vi.mocked(estimateCost).mockReturnValue(0.02)

    // First run
    const { POST } = await import('../../../app/api/pipeline/run/route')
    const res1 = await POST(new Request('http://localhost/api/pipeline/run', { method: 'POST' }))
    expect(res1.status).toBe(200)
    const json1 = await res1.json()
    expect(json1.itemCount).toBeGreaterThan(0)

    // URL is now seen
    expect(store.seen_articles.some(a => a.url === breakingUrl)).toBe(true)

    // Second run — importance >= 9 should bypass dedup
    const res2 = await POST(new Request('http://localhost/api/pipeline/run', { method: 'POST' }))
    expect(res2.status).toBe(200)
    const json2 = await res2.json()
    expect(json2.itemCount).toBeGreaterThan(0) // passes through despite being seen
  })
})
