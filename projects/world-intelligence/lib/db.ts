import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { hashPassword } from './auth'
import { getCategoryConfig } from './categories'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  schedule TEXT NOT NULL,
  categories TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  triage_model TEXT NOT NULL,
  synthesis_model TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_provider TEXT NOT NULL DEFAULT 'anthropic',
  triage_model TEXT NOT NULL DEFAULT 'gemini-1.5-flash-8b',
  synthesis_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  triage_fallbacks TEXT NOT NULL DEFAULT '[]',
  synthesis_fallbacks TEXT NOT NULL DEFAULT '[]',
  schedule_hours INTEGER NOT NULL DEFAULT 6,
  category_config TEXT NOT NULL DEFAULT '{}',
  providers TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS reports_fts USING fts5(
  id UNINDEXED,
  body,
  summary,
  content='reports',
  content_rowid='rowid'
);
`

let _db: Database.Database | null = null

export function initDb(): Database.Database {
  const dataDir = process.env.DATA_DIR || './data'
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  const dbPath = path.join(dataDir, 'world-intelligence.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  _db = db
  return db
}

export function getDb(): Database.Database {
  if (!_db) {
    return initDb()
  }
  return _db
}

export function getUser(username: string): { id: string; username: string; password_hash: string; created_at: number } | undefined {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as any
}

export async function createUser(username: string, password: string): Promise<void> {
  const { v4: uuidv4 } = await import('uuid')
  const hash = await hashPassword(password)
  getDb().prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    uuidv4(),
    username,
    hash,
    Date.now()
  )
}

export function getConfig(): Record<string, unknown> {
  const row = getDb().prepare('SELECT * FROM config WHERE id = 1').get() as any
  if (!row) return {}
  // Never return providers field directly - callers must handle that
  return row
}

export function saveConfig(updates: Record<string, unknown>): void {
  const existing = getConfig()
  const merged = { ...existing, ...updates, id: 1 }
  const cols = Object.keys(merged).join(', ')
  const vals = Object.keys(merged).map(() => '?').join(', ')
  const params = Object.values(merged)
  getDb().prepare(`INSERT OR REPLACE INTO config (${cols}) VALUES (${vals})`).run(...params)
}

export function getActiveCategoryConfig(): Record<string, { enabled: boolean; itemBudget: number }> {
  const row = getConfig()
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

export function saveReport(report: Report): void {
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO reports
      (id, created_at, schedule, categories, summary, body, cost_usd, triage_model, synthesis_model, item_count, source_count)
    VALUES
      (@id, @created_at, @schedule, @categories, @summary, @body, @cost_usd, @triage_model, @synthesis_model, @item_count, @source_count)
  `).run(report)
  // Update FTS index
  db.prepare(`INSERT OR REPLACE INTO reports_fts(rowid, id, body, summary) SELECT rowid, id, body, summary FROM reports WHERE id = ?`).run(report.id)
}

export function getReport(id: string): Report | null {
  return (getDb().prepare('SELECT * FROM reports WHERE id = ?').get(id) as Report | undefined) ?? null
}

export function getReports(limit: number, offset: number): Report[] {
  return getDb().prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Report[]
}

export function searchReports(query: string, limit: number): Report[] {
  try {
    const rows = getDb().prepare(`
      SELECT r.* FROM reports r
      JOIN reports_fts fts ON fts.id = r.id
      WHERE reports_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Report[]
    return rows
  } catch {
    return []
  }
}

export async function seedIfEmpty(): Promise<void> {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number }).n
  if (count === 0) {
    const username = process.env.INITIAL_ADMIN_USERNAME || 'admin'
    const password = process.env.INITIAL_ADMIN_PASSWORD || 'changeme'
    await createUser(username, password)
    console.log(`[seed] Created initial admin user: ${username}`)
  }
}
