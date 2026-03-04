import { describe, it, expect, vi, beforeAll } from 'vitest'

const mockSql = vi.fn().mockResolvedValue([])
;(mockSql as any).query = mockSql

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn().mockReturnValue(mockSql),
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test'
  const { initDb } = await import('../../../lib/db')
  await initDb()
})

describe('Database schema', () => {
  function findCall(keyword: string): string | undefined {
    return mockSql.mock.calls.map((c: any) => c[0] as string).find((q: string) =>
      q.includes('CREATE TABLE') && q.toLowerCase().includes(keyword)
    )
  }

  it('creates the reports table with correct columns', () => {
    const sql = findCall('reports')
    expect(sql).toBeTruthy()
    expect(sql).toContain('id TEXT PRIMARY KEY')
    expect(sql).toContain('created_at BIGINT NOT NULL')
    expect(sql).toContain('schedule TEXT NOT NULL')
    expect(sql).toContain('categories TEXT NOT NULL')
    expect(sql).toContain('summary TEXT NOT NULL')
    expect(sql).toContain('body TEXT NOT NULL')
    expect(sql).toContain('cost_usd REAL NOT NULL DEFAULT 0')
    expect(sql).toContain('triage_model TEXT NOT NULL')
    expect(sql).toContain('synthesis_model TEXT NOT NULL')
    expect(sql).toContain('item_count INTEGER NOT NULL DEFAULT 0')
    expect(sql).toContain('source_count INTEGER NOT NULL DEFAULT 0')
    expect(sql).toContain('search_vector tsvector')
  })

  it('creates the config table with correct columns', () => {
    const sql = findCall('config')
    expect(sql).toBeTruthy()
    expect(sql).toContain('active_provider')
    expect(sql).toContain('triage_model')
    expect(sql).toContain('synthesis_model')
    expect(sql).toContain('triage_fallbacks')
    expect(sql).toContain('synthesis_fallbacks')
    expect(sql).toContain('schedule_hours')
    expect(sql).toContain('category_config')
    expect(sql).toContain('providers')
  })

  it('creates the users table with correct columns', () => {
    const sql = findCall('users')
    expect(sql).toBeTruthy()
    expect(sql).toContain('id TEXT PRIMARY KEY')
    expect(sql).toContain('username TEXT UNIQUE NOT NULL')
    expect(sql).toContain('password_hash TEXT NOT NULL')
    expect(sql).toContain('created_at BIGINT NOT NULL')
  })

  it('creates FTS GIN index on reports', () => {
    const calls = mockSql.mock.calls.map((c: any) => c[0] as string)
    const indexSql = calls.find((q: string) => q.includes('CREATE INDEX') && q.includes('reports_fts_idx'))
    expect(indexSql).toBeTruthy()
    expect(indexSql).toContain('GIN(search_vector)')
  })

  it('creates FTS trigger function and trigger', () => {
    const calls = mockSql.mock.calls.map((c: any) => c[0] as string)
    const fnSql = calls.find((q: string) => q.includes('reports_search_vector_update'))
    expect(fnSql).toBeTruthy()
    expect(fnSql).toContain("to_tsvector('english'")
    const triggerSql = calls.find((q: string) => q.includes('CREATE TRIGGER') && q.includes('reports_search_vector_trigger'))
    expect(triggerSql).toBeTruthy()
  })

  it('enforces single row in config via CHECK constraint', () => {
    const sql = findCall('config')
    expect(sql).toContain('CHECK (id = 1)')
  })
})
