import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createMockStore, createMockSql } from '../helpers/mock-neon'
import { vi } from 'vitest'

const store = createMockStore()
const mockSql = createMockSql(store)

vi.doMock('@neondatabase/serverless', () => ({
  neon: vi.fn().mockReturnValue(mockSql),
}))

// Mock auth middleware for DELETE handler
vi.doMock('../../../lib/auth', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user1', username: 'admin' }),
  hashPassword: vi.fn().mockResolvedValue('hash'),
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test'
  process.env.JWT_SECRET = 'test-secret'
  const { initDb } = await import('../../../lib/db')
  await initDb()
})

beforeEach(() => {
  store.reports.length = 0
  store.seen_articles.length = 0
})

const makeReport = (overrides: Record<string, unknown> = {}) => ({
  id: `report-${Date.now()}-${Math.random()}`,
  created_at: Date.now(),
  schedule: '6h',
  categories: JSON.stringify(['geopolitics']),
  summary: 'Test report',
  body: '# Test',
  cost_usd: 0.05,
  triage_model: 'gemini-1.5-flash-8b',
  synthesis_model: 'claude-sonnet-4-6',
  item_count: 5,
  source_count: 3,
  ...overrides,
})

describe('deleteReport DB function', () => {
  it('removes report from store', async () => {
    const { saveReport, getReport, deleteReport } = await import('../../../lib/db')
    const report = makeReport({ id: 'del-test-1' })
    await saveReport(report as any)
    expect(await getReport('del-test-1')).toBeTruthy()

    await deleteReport('del-test-1')
    expect(await getReport('del-test-1')).toBeNull()
  })

  it('removes associated seen_articles', async () => {
    const { saveReport, deleteReport, markArticlesSeen } = await import('../../../lib/db')
    const report = makeReport({ id: 'del-test-2' })
    await saveReport(report as any)
    await markArticlesSeen(['https://example.com/a1', 'https://example.com/a2'], 'del-test-2')
    expect(store.seen_articles.length).toBe(2)

    await deleteReport('del-test-2')
    const remaining = store.seen_articles.filter(a => a.report_id === 'del-test-2')
    expect(remaining.length).toBe(0)
  })

  it('returns true when report existed', async () => {
    const { saveReport, deleteReport } = await import('../../../lib/db')
    const report = makeReport({ id: 'del-test-3' })
    await saveReport(report as any)

    const result = await deleteReport('del-test-3')
    expect(result).toBe(true)
  })

  it('returns false when report did not exist', async () => {
    const { deleteReport } = await import('../../../lib/db')
    const result = await deleteReport('nonexistent-id')
    expect(result).toBe(false)
  })
})

describe('DELETE /api/reports/[id]', () => {
  it('returns 204 on successful delete', async () => {
    const { saveReport } = await import('../../../lib/db')
    const report = makeReport({ id: 'api-del-1' })
    await saveReport(report as any)

    const { DELETE } = await import('../../../app/api/reports/[id]/route')
    const req = new Request('http://localhost/api/reports/api-del-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'api-del-1' }) })
    expect(res.status).toBe(204)
  })

  it('returns 404 for nonexistent report', async () => {
    const { DELETE } = await import('../../../app/api/reports/[id]/route')
    const req = new Request('http://localhost/api/reports/nope', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('report is gone after DELETE', async () => {
    const { saveReport, getReport } = await import('../../../lib/db')
    const report = makeReport({ id: 'api-del-2' })
    await saveReport(report as any)

    const { DELETE } = await import('../../../app/api/reports/[id]/route')
    const req = new Request('http://localhost/api/reports/api-del-2', { method: 'DELETE' })
    await DELETE(req, { params: Promise.resolve({ id: 'api-del-2' }) })

    expect(await getReport('api-del-2')).toBeNull()
  })
})
