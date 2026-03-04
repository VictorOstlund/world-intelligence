import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createMockStore, createMockSql } from '../helpers/mock-neon'

const store = createMockStore()
const mockSql = createMockSql(store)

vi.doMock('@neondatabase/serverless', () => ({
  neon: vi.fn().mockReturnValue(mockSql),
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test'
  process.env.JWT_SECRET = 'test-secret-minimum-32-chars-long!!'

  const { initDb, saveConfig } = await import('../../../lib/db')
  await initDb()

  // Seed config with a provider key
  await saveConfig({
    active_provider: 'anthropic',
    triage_model: 'gemini-1.5-flash-8b',
    synthesis_model: 'claude-sonnet-4-6',
    triage_fallbacks: '[]',
    synthesis_fallbacks: '[]',
    schedule_hours: 6,
    category_config: '{}',
    providers: JSON.stringify({
      anthropic: { apiKey: 'sk-ant-super-secret-key' },
      openai: { apiKey: 'sk-openai-secret' },
    }),
  })
})

describe('GET /api/settings', () => {
  it('returns config with provider keys redacted', async () => {
    const { GET } = await import('../../../app/api/settings/route')
    const req = new Request('http://localhost/api/settings')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('active_provider', 'anthropic')
    expect(json).toHaveProperty('triage_model')
    expect(json).toHaveProperty('synthesis_model')
    // Provider keys must be redacted — never return actual key
    const text = JSON.stringify(json)
    expect(text).not.toContain('sk-ant-super-secret-key')
    expect(text).not.toContain('sk-openai-secret')
  })

  it('returns __masked__ sentinel when provider has a saved key', async () => {
    const { GET } = await import('../../../app/api/settings/route')
    const req = new Request('http://localhost/api/settings')
    const res = await GET(req)
    const json = await res.json()
    // Providers with saved keys must return '__masked__' sentinel
    expect(json.providers.anthropic.apiKey).toBe('__masked__')
    expect(json.providers.openai.apiKey).toBe('__masked__')
  })

  it('returns empty string when provider has no saved key', async () => {
    const { GET } = await import('../../../app/api/settings/route')
    const req = new Request('http://localhost/api/settings')
    const res = await GET(req)
    const json = await res.json()
    // Providers without saved keys should return '' (not __masked__)
    // gemini was never configured in our seed data
    const geminiKey = json.providers?.gemini?.apiKey
    expect(geminiKey === '' || geminiKey === undefined).toBe(true)
  })
})

describe('POST /api/settings', () => {
  it('saves config updates', async () => {
    const { POST } = await import('../../../app/api/settings/route')
    const req = new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active_provider: 'openai',
        triage_model: 'gpt-4o-mini',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)

    // Verify it was actually saved
    const { GET } = await import('../../../app/api/settings/route')
    const getReq = new Request('http://localhost/api/settings')
    const getRes = await GET(getReq)
    const getJson = await getRes.json()
    expect(getJson.active_provider).toBe('openai')
    expect(getJson.triage_model).toBe('gpt-4o-mini')
  })

  it('stores provider keys when provided', async () => {
    const { POST } = await import('../../../app/api/settings/route')
    const req = new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: { anthropic: { apiKey: 'sk-ant-new-key' } },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    // Confirm it's stored (via direct db check, not via GET which redacts)
    const { getConfig } = await import('../../../lib/db')
    const config = await getConfig() as any
    const providers = typeof config.providers === 'string' ? JSON.parse(config.providers) : config.providers
    expect(providers?.anthropic?.apiKey).toBe('sk-ant-new-key')
  })

  it('preserves existing key when POST sends __masked__ sentinel', async () => {
    // First, ensure we have a known key in DB
    const { POST: POST1 } = await import('../../../app/api/settings/route')
    await POST1(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: { anthropic: { apiKey: 'sk-ant-preserved-key' } },
      }),
    }))

    // Now POST with sentinel — should NOT overwrite
    const { POST: POST2 } = await import('../../../app/api/settings/route')
    await POST2(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: { anthropic: { apiKey: '__masked__' } },
      }),
    }))

    // Verify the original key is still in DB
    const { getConfig } = await import('../../../lib/db')
    const config = await getConfig() as any
    const providers = typeof config.providers === 'string' ? JSON.parse(config.providers) : config.providers
    expect(providers?.anthropic?.apiKey).toBe('sk-ant-preserved-key')
  })

  it('replaces existing key when POST sends a new non-sentinel value', async () => {
    const { POST } = await import('../../../app/api/settings/route')
    await POST(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: { anthropic: { apiKey: 'sk-ant-brand-new-key' } },
      }),
    }))

    const { getConfig } = await import('../../../lib/db')
    const config = await getConfig() as any
    const providers = typeof config.providers === 'string' ? JSON.parse(config.providers) : config.providers
    expect(providers?.anthropic?.apiKey).toBe('sk-ant-brand-new-key')
  })
})

describe('GET /api/settings/categories', () => {
  it('returns merged category config', async () => {
    const { GET } = await import('../../../app/api/settings/categories/route')
    const req = new Request('http://localhost/api/settings/categories')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    // Should have all 15 default categories
    expect(Object.keys(json).length).toBeGreaterThanOrEqual(15)
    expect(json).toHaveProperty('geopolitics')
    expect(json.geopolitics).toHaveProperty('enabled')
    expect(json.geopolitics).toHaveProperty('itemBudget')
  })
})

describe('POST /api/settings/categories', () => {
  it('saves category config overrides', async () => {
    const { POST } = await import('../../../app/api/settings/categories/route')
    const req = new Request('http://localhost/api/settings/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryConfig: {
          geopolitics: { enabled: false, itemBudget: 10 },
        },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)

    // Verify saved
    const { GET } = await import('../../../app/api/settings/categories/route')
    const getReq = new Request('http://localhost/api/settings/categories')
    const getRes = await GET(getReq)
    const getJson = await getRes.json()
    expect(getJson.geopolitics.enabled).toBe(false)
    expect(getJson.geopolitics.itemBudget).toBe(10)
  })
})
