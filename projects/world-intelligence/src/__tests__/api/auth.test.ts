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

  const { initDb, createUser } = await import('../../../lib/db')
  await initDb()
  await createUser('testuser', 'testpass123')
})

describe('POST /api/auth/login', () => {
  it('returns 200 and sets httpOnly session cookie on valid credentials', async () => {
    const { POST } = await import('../../../app/api/auth/login/route')
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain('session=')
    expect(setCookie).toContain('HttpOnly')
  })

  it('returns 401 on invalid credentials', async () => {
    const { POST } = await import('../../../app/api/auth/login/route')
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'wrongpassword' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBeTruthy()
    // Must NOT leak password hash
    expect(JSON.stringify(json)).not.toContain('$2')
  })

  it('returns 401 for unknown user', async () => {
    const { POST } = await import('../../../app/api/auth/login/route')
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nobody', password: 'anything' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
