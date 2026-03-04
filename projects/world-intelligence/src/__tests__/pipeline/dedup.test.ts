import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockStore, createMockSql } from '../helpers/mock-neon'

// Set DATABASE_URL before any db import
process.env.DATABASE_URL = 'postgres://test:test@localhost/test'

let store: ReturnType<typeof createMockStore>
let mockSql: ReturnType<typeof createMockSql>

beforeEach(() => {
  vi.resetModules()
  store = createMockStore()
  mockSql = createMockSql(store)

  vi.doMock('@neondatabase/serverless', () => ({
    neon: vi.fn().mockReturnValue(mockSql),
  }))
})

describe('markArticlesSeen', () => {
  it('inserts article URLs into seen_articles', async () => {
    const { markArticlesSeen } = await import('../../../lib/db')

    await markArticlesSeen(
      ['https://example.com/a', 'https://example.com/b'],
      'report-1',
    )

    expect(store.seen_articles).toHaveLength(2)
    expect(store.seen_articles[0].url).toBe('https://example.com/a')
    expect(store.seen_articles[0].report_id).toBe('report-1')
    expect(typeof store.seen_articles[0].first_seen_at).toBe('number')
  })

  it('does not overwrite existing entries (ON CONFLICT DO NOTHING)', async () => {
    // Pre-seed an article
    store.seen_articles.push({
      url: 'https://example.com/a',
      first_seen_at: 1000,
      report_id: 'old-report',
    })

    const { markArticlesSeen } = await import('../../../lib/db')
    await markArticlesSeen(['https://example.com/a'], 'new-report')

    // Should still be 1 entry with original values
    expect(store.seen_articles).toHaveLength(1)
    expect(store.seen_articles[0].report_id).toBe('old-report')
    expect(store.seen_articles[0].first_seen_at).toBe(1000)
  })

  it('handles empty URL array gracefully', async () => {
    const { markArticlesSeen } = await import('../../../lib/db')
    await markArticlesSeen([], 'report-1')
    expect(store.seen_articles).toHaveLength(0)
  })
})

describe('filterSeenUrls', () => {
  it('filters out items whose URLs have been seen within 30 days', async () => {
    // Seed a recently-seen article
    store.seen_articles.push({
      url: 'https://example.com/old',
      first_seen_at: Date.now() - 1000, // just seen
      report_id: 'r1',
    })

    const { filterSeenUrls } = await import('../../../lib/db')
    const items = [
      { url: 'https://example.com/old', title: 'Old', description: 'd', pubDate: '', category: 'geo', relevanceScore: 7, noveltyScore: 7, importanceScore: 7 },
      { url: 'https://example.com/new', title: 'New', description: 'd', pubDate: '', category: 'geo', relevanceScore: 7, noveltyScore: 7, importanceScore: 7 },
    ]

    const result = await filterSeenUrls(items)

    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://example.com/new')
  })

  it('allows items with importanceScore >= 9 through even if seen', async () => {
    store.seen_articles.push({
      url: 'https://example.com/breaking',
      first_seen_at: Date.now() - 1000,
      report_id: 'r1',
    })

    const { filterSeenUrls } = await import('../../../lib/db')
    const items = [
      { url: 'https://example.com/breaking', title: 'Breaking', description: 'd', pubDate: '', category: 'geo', relevanceScore: 9, noveltyScore: 9, importanceScore: 9 },
    ]

    const result = await filterSeenUrls(items)
    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://example.com/breaking')
  })

  it('exempts articles older than 30 days from dedup', async () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000
    store.seen_articles.push({
      url: 'https://example.com/stale',
      first_seen_at: thirtyOneDaysAgo,
      report_id: 'r-old',
    })

    const { filterSeenUrls } = await import('../../../lib/db')
    const items = [
      { url: 'https://example.com/stale', title: 'Stale', description: 'd', pubDate: '', category: 'geo', relevanceScore: 5, noveltyScore: 5, importanceScore: 5 },
    ]

    const result = await filterSeenUrls(items)
    expect(result).toHaveLength(1) // passes through because seen_at is > 30 days ago
  })

  it('returns all items when none have been seen', async () => {
    const { filterSeenUrls } = await import('../../../lib/db')
    const items = [
      { url: 'https://example.com/a', title: 'A', description: 'd', pubDate: '', category: 'geo', relevanceScore: 7, noveltyScore: 7, importanceScore: 7 },
      { url: 'https://example.com/b', title: 'B', description: 'd', pubDate: '', category: 'geo', relevanceScore: 8, noveltyScore: 8, importanceScore: 8 },
    ]

    const result = await filterSeenUrls(items)
    expect(result).toHaveLength(2)
  })

  it('handles empty items array', async () => {
    const { filterSeenUrls } = await import('../../../lib/db')
    const result = await filterSeenUrls([])
    expect(result).toHaveLength(0)
  })
})
