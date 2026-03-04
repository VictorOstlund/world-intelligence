import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('provision-neon', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    process.env.VERCEL_TOKEN = 'test-token-123'
    process.env.DATABASE_URL = 'postgres://test:test@ep-test.us-east-2.aws.neon.tech/testdb'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('can be imported without errors', async () => {
    const mod = await import('../../../scripts/provision-neon')
    expect(mod.provision).toBeDefined()
    expect(typeof mod.provision).toBe('function')
  })

  it('throws if DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    const mod = await import('../../../scripts/provision-neon')
    await expect(mod.provision()).rejects.toThrow('DATABASE_URL is required')
  })

  it('throws if VERCEL_TOKEN is missing', async () => {
    delete process.env.VERCEL_TOKEN
    const mod = await import('../../../scripts/provision-neon')
    await expect(mod.provision('postgres://test')).rejects.toThrow('VERCEL_TOKEN')
  })

  it('creates new env var and triggers redeploy when env var does not exist', async () => {
    // Mock list env vars — no existing DATABASE_URL
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ envs: [] }),
        text: async () => '',
      })
      // Mock create env var
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uid: 'env-123' }),
        text: async () => '',
      })
      // Mock create deployment (first attempt succeeds)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-abc', url: 'world-intelligence-abc.vercel.app' }),
        text: async () => '',
      })

    const mod = await import('../../../scripts/provision-neon')
    const result = await mod.provision('postgres://test:test@ep-test.neon.tech/db')

    expect(result.envSet).toBe(true)
    expect(result.redeployUrl).toBe('world-intelligence-abc.vercel.app')

    // Verify env var creation call
    const createCall = mockFetch.mock.calls[1]
    expect(createCall[0]).toContain('/env')
    const createBody = JSON.parse(createCall[1].body)
    expect(createBody.key).toBe('DATABASE_URL')
    expect(createBody.value).toBe('postgres://test:test@ep-test.neon.tech/db')
    expect(createBody.target).toEqual(['production', 'preview'])
  })

  it('updates existing env var when DATABASE_URL already exists', async () => {
    // Mock list env vars — DATABASE_URL exists
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ envs: [{ id: 'env-existing', key: 'DATABASE_URL' }] }),
        text: async () => '',
      })
      // Mock PATCH env var
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uid: 'env-existing' }),
        text: async () => '',
      })
      // Mock create deployment
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-xyz', url: 'world-intelligence-xyz.vercel.app' }),
        text: async () => '',
      })

    const mod = await import('../../../scripts/provision-neon')
    const result = await mod.provision('postgres://new-url')

    expect(result.envSet).toBe(true)

    // Verify PATCH call (not POST)
    const patchCall = mockFetch.mock.calls[1]
    expect(patchCall[0]).toContain('/env/env-existing')
    expect(patchCall[1].method).toBe('PATCH')
  })

  it('falls back to redeploying last deployment if initial deploy fails', async () => {
    mockFetch
      // List env vars
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ envs: [] }),
        text: async () => '',
      })
      // Create env var
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uid: 'env-123' }),
        text: async () => '',
      })
      // First deploy attempt fails
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({}),
        text: async () => 'Bad Request',
      })
      // List deployments
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deployments: [{ uid: 'dpl-last' }] }),
        text: async () => '',
      })
      // Redeploy from last
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-new', url: 'world-intelligence-new.vercel.app' }),
        text: async () => '',
      })

    const mod = await import('../../../scripts/provision-neon')
    const result = await mod.provision('postgres://test')

    expect(result.envSet).toBe(true)
    expect(result.redeployUrl).toBe('world-intelligence-new.vercel.app')
  })
})
