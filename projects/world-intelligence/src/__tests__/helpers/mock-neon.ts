/**
 * In-memory mock for @neondatabase/serverless.
 * Handles the specific SQL patterns used by lib/db.ts.
 */
import { vi } from 'vitest'

interface Store {
  users: Record<string, unknown>[]
  config: Record<string, unknown>[]
  reports: Record<string, unknown>[]
  seen_articles: Record<string, unknown>[]
}

export function createMockStore(): Store {
  return { users: [], config: [], reports: [], seen_articles: [] }
}

export function createMockSql(store: Store) {
  const mockSql = vi.fn(async (query: string, params?: unknown[]): Promise<Record<string, unknown>[]> => {
    const q = query.replace(/\s+/g, ' ').trim().toLowerCase()

    // DDL — no-op
    if (
      q.startsWith('create table') ||
      q.startsWith('create index') ||
      q.startsWith('create or replace function') ||
      q.startsWith('create trigger') ||
      q.startsWith('drop trigger')
    ) {
      return []
    }

    // INSERT INTO users
    if (q.includes('insert into users')) {
      const [id, username, password_hash, created_at] = params as any[]
      store.users.push({ id, username, password_hash, created_at })
      return []
    }

    // SELECT * FROM users WHERE username = $1
    if (q.includes('from users') && q.includes('where') && q.includes('username')) {
      const row = store.users.find(u => u.username === (params as any[])[0])
      return row ? [row] : []
    }

    // SELECT COUNT(*) as n FROM users
    if (q.includes('count(*)') && q.includes('from users')) {
      return [{ n: store.users.length }]
    }

    // INSERT INTO config ... ON CONFLICT
    if (q.includes('insert into config')) {
      const colMatch = query.match(/INSERT INTO config\s*\(([^)]+)\)/i)
      if (colMatch) {
        const cols = colMatch[1].split(',').map(c => c.trim())
        const row: Record<string, unknown> = {}
        cols.forEach((col, i) => { row[col] = (params as any[])[i] })
        const idx = store.config.findIndex(c => c.id === 1)
        if (idx >= 0) {
          store.config[idx] = { ...store.config[idx], ...row }
        } else {
          store.config.push(row)
        }
      }
      return []
    }

    // SELECT * FROM config WHERE id = 1
    if (q.includes('from config') && q.includes('where') && q.includes('id')) {
      return store.config.filter(c => c.id === 1)
    }

    // INSERT INTO reports ... ON CONFLICT
    if (q.includes('insert into reports')) {
      const p = params as any[]
      const row: Record<string, unknown> = {
        id: p[0], created_at: p[1], schedule: p[2], categories: p[3],
        summary: p[4], body: p[5], cost_usd: p[6], triage_model: p[7],
        synthesis_model: p[8], item_count: p[9], source_count: p[10],
      }
      const idx = store.reports.findIndex(r => r.id === row.id)
      if (idx >= 0) {
        store.reports[idx] = row
      } else {
        store.reports.push(row)
      }
      return []
    }

    // SELECT COUNT(*) as n FROM reports
    if (q.includes('count(*)') && q.includes('from reports')) {
      return [{ n: store.reports.length }]
    }

    // FTS search (search_vector / plainto_tsquery)
    if (q.includes('search_vector') || q.includes('plainto_tsquery')) {
      const searchTerm = String((params as any[])[0]).toLowerCase()
      const limit = Number((params as any[])[1]) || 50
      const matches = store.reports.filter(r =>
        String(r.body || '').toLowerCase().includes(searchTerm) ||
        String(r.summary || '').toLowerCase().includes(searchTerm)
      )
      return matches.slice(0, limit)
    }

    // SELECT * FROM reports ORDER BY created_at DESC LIMIT $1 OFFSET $2
    if (q.includes('from reports') && q.includes('order by') && q.includes('limit')) {
      const sorted = [...store.reports].sort((a, b) => Number(b.created_at) - Number(a.created_at))
      const limit = Number((params as any[])[0])
      const offset = Number((params as any[])[1])
      return sorted.slice(offset, offset + limit)
    }

    // SELECT * FROM reports WHERE id = $1
    if (q.includes('from reports') && q.includes('where') && q.includes('id')) {
      const row = store.reports.find(r => r.id === (params as any[])[0])
      return row ? [row] : []
    }

    // INSERT INTO seen_articles ... ON CONFLICT DO NOTHING
    if (q.includes('insert into seen_articles')) {
      const [url, first_seen_at, report_id] = params as any[]
      const exists = store.seen_articles.find(a => a.url === url)
      if (!exists) {
        store.seen_articles.push({ url, first_seen_at, report_id })
      }
      return []
    }

    // SELECT url FROM seen_articles WHERE url = ANY($1) AND first_seen_at > $2
    if (q.includes('from seen_articles') && q.includes('where') && q.includes('url')) {
      const urls = (params as any[])[0] as string[]
      const cutoff = Number((params as any[])[1])
      const matches = store.seen_articles.filter(
        a => urls.includes(a.url as string) && Number(a.first_seen_at) > cutoff
      )
      return matches.map(a => ({ url: a.url }))
    }

    return []
  })

  // rawQuery in db.ts calls getSql().query(sql, params)
  mockSql.query = mockSql

  return mockSql
}

/**
 * Setup vi.mock for @neondatabase/serverless with a shared in-memory store.
 * Call this BEFORE any imports of lib/db.
 * Returns { store, mockSql } for inspection/seeding in tests.
 */
export function setupNeonMock() {
  const store = createMockStore()
  const mockSql = createMockSql(store)

  vi.mock('@neondatabase/serverless', () => ({
    neon: vi.fn().mockReturnValue(mockSql),
  }))

  return { store, mockSql }
}
