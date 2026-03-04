import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wi-reports-test-'))
  process.env.DATA_DIR = tmpDir
  process.env.JWT_SECRET = 'test-secret-minimum-32-chars-long!!'

  const { initDb, saveReport } = await import('../../../lib/db')
  initDb()

  // Seed test reports
  saveReport({
    id: 'report-1',
    created_at: Date.now() - 2000,
    schedule: '6h',
    categories: '["geopolitics","economics"]',
    summary: 'Global markets declined amid geopolitical tensions.',
    body: '# World Intelligence Report\n\n## Executive Summary\nGlobal markets declined amid geopolitical tensions.\n\n## Geopolitics\nSome geopolitical events happened.',
    cost_usd: 0.05,
    triage_model: 'gemini-1.5-flash-8b',
    synthesis_model: 'claude-sonnet-4-6',
    item_count: 10,
    source_count: 5,
  })
  saveReport({
    id: 'report-2',
    created_at: Date.now() - 1000,
    schedule: '6h',
    categories: '["technology"]',
    summary: 'AI breakthroughs dominate tech news.',
    body: '# World Intelligence Report\n\n## Executive Summary\nAI breakthroughs dominate tech news.\n\n## Technology\nNew AI models released.',
    cost_usd: 0.03,
    triage_model: 'gemini-1.5-flash-8b',
    synthesis_model: 'claude-sonnet-4-6',
    item_count: 8,
    source_count: 4,
  })
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true })
})

describe('GET /api/reports', () => {
  it('returns paginated reports list', async () => {
    const { GET } = await import('../../../app/api/reports/route')
    const req = new Request('http://localhost/api/reports')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('reports')
    expect(json).toHaveProperty('total')
    expect(Array.isArray(json.reports)).toBe(true)
    expect(json.reports.length).toBe(2)
    // Newest first
    expect(json.reports[0].id).toBe('report-2')
    expect(json.reports[1].id).toBe('report-1')
  })

  it('respects limit and offset', async () => {
    const { GET } = await import('../../../app/api/reports/route')
    const req = new Request('http://localhost/api/reports?limit=1&offset=0')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.reports.length).toBe(1)
    expect(json.reports[0].id).toBe('report-2')
  })

  it('returns FTS search results when ?q= is provided', async () => {
    const { GET } = await import('../../../app/api/reports/route')
    const req = new Request('http://localhost/api/reports?q=geopolitical')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('reports')
    expect(Array.isArray(json.reports)).toBe(true)
    // Should find report-1 which contains "geopolitical"
    const ids = json.reports.map((r: any) => r.id)
    expect(ids).toContain('report-1')
  })

  it('does not return provider keys in reports list', async () => {
    const { GET } = await import('../../../app/api/reports/route')
    const req = new Request('http://localhost/api/reports')
    const res = await GET(req)
    const text = await res.text()
    expect(text).not.toContain('apiKey')
    expect(text).not.toContain('password')
  })
})

describe('GET /api/reports/[id]', () => {
  it('returns a single report by id', async () => {
    const { GET } = await import('../../../app/api/reports/[id]/route')
    const req = new Request('http://localhost/api/reports/report-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'report-1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe('report-1')
    expect(json.summary).toBe('Global markets declined amid geopolitical tensions.')
    expect(json.body).toContain('# World Intelligence Report')
  })

  it('returns 404 for unknown id', async () => {
    const { GET } = await import('../../../app/api/reports/[id]/route')
    const req = new Request('http://localhost/api/reports/nonexistent')
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })
})
