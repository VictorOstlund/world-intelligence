import { neon } from '@neondatabase/serverless'
import { hashPassword } from './auth'
import { getCategoryConfig } from './categories'

type SqlFunction = ReturnType<typeof neon>

let _sql: SqlFunction | null = null

function getSql(): SqlFunction {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL environment variable is required')
    _sql = neon(url)
  }
  return _sql
}

let _initialized = false

/** Use sql.query() for parameterised queries (neon v1+ API) */
async function query(sqlStr: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
  if (!_initialized) {
    await initDb()
    _initialized = true
  }
  return (getSql() as any).query(sqlStr, params ?? []) as Promise<Record<string, unknown>[]>
}

export async function initDb(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`)

  await query(`CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_provider TEXT NOT NULL DEFAULT 'anthropic',
    triage_model TEXT NOT NULL DEFAULT 'gemini-1.5-flash-8b',
    synthesis_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    triage_fallbacks TEXT NOT NULL DEFAULT '[]',
    synthesis_fallbacks TEXT NOT NULL DEFAULT '[]',
    schedule_hours INTEGER NOT NULL DEFAULT 6,
    category_config TEXT NOT NULL DEFAULT '{}',
    providers TEXT NOT NULL DEFAULT '{}'
  )`)

  await query(`CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    created_at BIGINT NOT NULL,
    schedule TEXT NOT NULL,
    categories TEXT NOT NULL,
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    cost_usd REAL NOT NULL DEFAULT 0,
    triage_model TEXT NOT NULL,
    synthesis_model TEXT NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0,
    search_vector tsvector
  )`)

  await query(`CREATE INDEX IF NOT EXISTS reports_fts_idx ON reports USING GIN(search_vector)`)

  await query(`
    CREATE OR REPLACE FUNCTION reports_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english', coalesce(NEW.body,'') || ' ' || coalesce(NEW.summary,''));
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `)

  await query(`DROP TRIGGER IF EXISTS reports_search_vector_trigger ON reports`)
  await query(`CREATE TRIGGER reports_search_vector_trigger BEFORE INSERT OR UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION reports_search_vector_update()`)
}

export async function getUser(username: string): Promise<{ id: string; username: string; password_hash: string; created_at: number } | undefined> {
  const rows = await query('SELECT * FROM users WHERE username = $1', [username])
  if (!rows[0]) return undefined
  return { ...rows[0], created_at: Number(rows[0].created_at) } as any
}

export async function createUser(username: string, password: string): Promise<void> {
  const { v4: uuidv4 } = await import('uuid')
  const hash = await hashPassword(password)
  await query('INSERT INTO users (id, username, password_hash, created_at) VALUES ($1, $2, $3, $4)', [
    uuidv4(),
    username,
    hash,
    Date.now(),
  ])
}

export async function getConfig(): Promise<Record<string, unknown>> {
  const rows = await query('SELECT * FROM config WHERE id = 1')
  if (!rows[0]) return {}
  const row = rows[0] as Record<string, unknown>
  if (row.schedule_hours !== undefined) row.schedule_hours = Number(row.schedule_hours)
  return row
}

export async function saveConfig(updates: Record<string, unknown>): Promise<void> {
  const existing = await getConfig()
  const merged: Record<string, unknown> = { ...existing, ...updates, id: 1 }
  const cols = Object.keys(merged)
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
  const setClauses = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')
  const params = cols.map(c => merged[c])
  await query(
    `INSERT INTO config (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${setClauses}`,
    params,
  )
}

export async function getActiveCategoryConfig(): Promise<Record<string, { enabled: boolean; itemBudget: number }>> {
  const row = await getConfig()
  const dbCategoryConfig = (row as any)?.category_config || '{}'
  let parsed: Record<string, { enabled: boolean; itemBudget: number }> = {}
  try {
    parsed = typeof dbCategoryConfig === 'string' ? JSON.parse(dbCategoryConfig) : dbCategoryConfig
  } catch {
    parsed = {}
  }
  return getCategoryConfig(parsed)
}

export interface Report {
  id: string
  created_at: number
  schedule: string
  categories: string
  summary: string
  body: string
  cost_usd: number
  triage_model: string
  synthesis_model: string
  item_count: number
  source_count: number
}

function parseReport(row: Record<string, unknown>): Report {
  return {
    id: row.id as string,
    created_at: Number(row.created_at),
    schedule: row.schedule as string,
    categories: row.categories as string,
    summary: row.summary as string,
    body: row.body as string,
    cost_usd: Number(row.cost_usd),
    triage_model: row.triage_model as string,
    synthesis_model: row.synthesis_model as string,
    item_count: Number(row.item_count),
    source_count: Number(row.source_count),
  }
}

export async function saveReport(report: Report): Promise<void> {
  await query(
    `INSERT INTO reports (id, created_at, schedule, categories, summary, body, cost_usd, triage_model, synthesis_model, item_count, source_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       created_at = EXCLUDED.created_at,
       schedule = EXCLUDED.schedule,
       categories = EXCLUDED.categories,
       summary = EXCLUDED.summary,
       body = EXCLUDED.body,
       cost_usd = EXCLUDED.cost_usd,
       triage_model = EXCLUDED.triage_model,
       synthesis_model = EXCLUDED.synthesis_model,
       item_count = EXCLUDED.item_count,
       source_count = EXCLUDED.source_count`,
    [report.id, report.created_at, report.schedule, report.categories, report.summary, report.body, report.cost_usd, report.triage_model, report.synthesis_model, report.item_count, report.source_count],
  )
}

export async function getReport(id: string): Promise<Report | null> {
  const rows = await query('SELECT * FROM reports WHERE id = $1', [id])
  if (!rows[0]) return null
  return parseReport(rows[0])
}

export async function getReports(limit: number, offset: number): Promise<Report[]> {
  const rows = await query('SELECT * FROM reports ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset])
  return rows.map(r => parseReport(r))
}

export async function getReportCount(): Promise<number> {
  const rows = await query('SELECT COUNT(*) as n FROM reports')
  return Number(rows[0]?.n ?? 0)
}

export async function searchReports(queryStr: string, limit: number): Promise<Report[]> {
  try {
    const rows = await query(
      `SELECT id, created_at, schedule, categories, summary, body, cost_usd, triage_model, synthesis_model, item_count, source_count
       FROM reports
       WHERE search_vector @@ plainto_tsquery('english', $1)
       ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
       LIMIT $2`,
      [queryStr, limit],
    )
    return rows.map(r => parseReport(r))
  } catch {
    return []
  }
}

export async function seedIfEmpty(): Promise<void> {
  const rows = await query('SELECT COUNT(*) as n FROM users')
  const count = Number(rows[0]?.n ?? 0)
  if (count === 0) {
    const username = process.env.INITIAL_ADMIN_USERNAME || 'admin'
    const password = process.env.INITIAL_ADMIN_PASSWORD || 'changeme'
    await createUser(username, password)
    console.log(`[seed] Created initial admin user: ${username}`)
  }
}
