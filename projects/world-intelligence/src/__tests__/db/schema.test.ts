import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

let db: Database.Database
let tmpDir: string

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wi-test-'))
  process.env.DATA_DIR = tmpDir

  const { initDb } = await import('../../../lib/db')
  db = initDb()
})

afterAll(() => {
  if (db) db.close()
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true })
})

describe('Database schema', () => {
  it('creates the reports table with correct columns', () => {
    const cols = db.pragma('table_info(reports)') as Array<{ name: string; type: string; notnull: number }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('created_at')
    expect(names).toContain('schedule')
    expect(names).toContain('categories')
    expect(names).toContain('summary')
    expect(names).toContain('body')
    expect(names).toContain('cost_usd')
    expect(names).toContain('triage_model')
    expect(names).toContain('synthesis_model')
    expect(names).toContain('item_count')
    expect(names).toContain('source_count')
  })

  it('creates the config table with correct columns', () => {
    const cols = db.pragma('table_info(config)') as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('active_provider')
    expect(names).toContain('triage_model')
    expect(names).toContain('synthesis_model')
    expect(names).toContain('triage_fallbacks')
    expect(names).toContain('synthesis_fallbacks')
    expect(names).toContain('schedule_hours')
    expect(names).toContain('category_config')
    expect(names).toContain('providers')
  })

  it('creates the users table with correct columns', () => {
    const cols = db.pragma('table_info(users)') as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('username')
    expect(names).toContain('password_hash')
    expect(names).toContain('created_at')
  })

  it('creates the reports_fts virtual table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reports_fts'").get() as { name: string } | undefined
    expect(row?.name).toBe('reports_fts')
  })

  it('enforces single row in config via CHECK constraint', () => {
    db.prepare("INSERT OR IGNORE INTO config (id) VALUES (1)").run()
    expect(() => {
      db.prepare("INSERT INTO config (id) VALUES (2)").run()
    }).toThrow()
  })
})
