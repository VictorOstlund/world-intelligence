import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wi-reports-test-'))
  process.env.DATA_DIR = tmpDir

  // Reset module cache so initDb picks up new DATA_DIR
  const { initDb } = await import('../../../lib/db')
  initDb()
})

afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true })
})

const makeReport = (overrides: Partial<Parameters<(typeof import('../../../lib/db'))['saveReport']>[0]> = {}) => ({
  id: `report-${Date.now()}-${Math.random()}`,
  created_at: Date.now(),
  schedule: '6h',
  categories: JSON.stringify(['geopolitics', 'economics']),
  summary: 'Test report summary',
  body: '# Test Report\n\nSome content here about geopolitics and economics.',
  cost_usd: 0.05,
  triage_model: 'gemini-1.5-flash-8b',
  synthesis_model: 'claude-sonnet-4-6',
  item_count: 10,
  source_count: 5,
  ...overrides,
})

describe('saveReport', () => {
  it('inserts a report and it can be retrieved', async () => {
    const { saveReport, getReport } = await import('../../../lib/db')
    const report = makeReport()
    saveReport(report)

    const retrieved = getReport(report.id)
    expect(retrieved).toBeTruthy()
    expect(retrieved!.id).toBe(report.id)
    expect(retrieved!.summary).toBe(report.summary)
  })

  it('stores cost_usd correctly', async () => {
    const { saveReport, getReport } = await import('../../../lib/db')
    const report = makeReport({ cost_usd: 1.2345 })
    saveReport(report)

    const retrieved = getReport(report.id)
    expect(retrieved!.cost_usd).toBeCloseTo(1.2345)
  })
})

describe('getReports', () => {
  it('returns paginated list ordered by created_at desc', async () => {
    const { saveReport, getReports } = await import('../../../lib/db')
    const r1 = makeReport({ id: 'r-oldest', created_at: 1000, summary: 'Oldest' })
    const r2 = makeReport({ id: 'r-newest', created_at: 9999, summary: 'Newest' })
    saveReport(r1)
    saveReport(r2)

    const results = getReports(10, 0)
    expect(results.length).toBeGreaterThanOrEqual(2)
    // Newest first
    const newIdx = results.findIndex(r => r.id === 'r-newest')
    const oldIdx = results.findIndex(r => r.id === 'r-oldest')
    expect(newIdx).toBeLessThan(oldIdx)
  })

  it('respects limit and offset', async () => {
    const { getReports } = await import('../../../lib/db')
    const page1 = getReports(1, 0)
    const page2 = getReports(1, 1)
    expect(page1.length).toBe(1)
    expect(page2.length).toBe(1)
    expect(page1[0].id).not.toBe(page2[0].id)
  })
})

describe('searchReports', () => {
  it('finds reports by body content via FTS', async () => {
    const { saveReport, searchReports } = await import('../../../lib/db')
    const uniqueWord = 'zygomorphic' + Date.now()
    const report = makeReport({
      id: 'fts-test-report',
      body: `# Report\n\nSomething about ${uniqueWord} in today's geopolitics.`,
      summary: 'FTS test report',
    })
    saveReport(report)

    const results = searchReports(uniqueWord, 10)
    expect(results.some(r => r.id === 'fts-test-report')).toBe(true)
  })

  it('finds reports by summary content', async () => {
    const { saveReport, searchReports } = await import('../../../lib/db')
    const uniqueWord = 'peculiarterm' + Date.now()
    const report = makeReport({
      id: 'fts-summary-report',
      summary: `Summary with ${uniqueWord}`,
    })
    saveReport(report)

    const results = searchReports(uniqueWord, 10)
    expect(results.some(r => r.id === 'fts-summary-report')).toBe(true)
  })

  it('returns empty array when no match', async () => {
    const { searchReports } = await import('../../../lib/db')
    const results = searchReports('xyzxyz_no_match_term_12345', 10)
    expect(results).toEqual([])
  })
})
