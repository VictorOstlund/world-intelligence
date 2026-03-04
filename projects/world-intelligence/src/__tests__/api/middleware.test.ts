import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Must be hoisted before importing middleware
vi.mock('../../../lib/auth', () => ({
  verifyJwt: vi.fn(),
  signJwt: vi.fn(),
}))

describe('Auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure JWT_SECRET is set (middleware may need it)
    process.env.JWT_SECRET = 'test-secret-minimum-32-chars-long!!'
  })

  it('redirects to /login when no session cookie on protected API route', async () => {
    const { verifyJwt } = await import('../../../lib/auth')
    vi.mocked(verifyJwt).mockResolvedValue(null)

    const { middleware } = await import('../../../middleware')
    const req = new NextRequest('http://localhost/api/reports')
    const res = await middleware(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('allows /api/auth/* routes without any session cookie', async () => {
    const { middleware } = await import('../../../middleware')
    const req = new NextRequest('http://localhost/api/auth/login', { method: 'POST' })
    const res = await middleware(req)

    // Auth routes are exempt — should pass through, not redirect
    expect(res.status).not.toBe(307)
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows access when valid session cookie is present', async () => {
    const { verifyJwt } = await import('../../../lib/auth')
    vi.mocked(verifyJwt).mockResolvedValue({ userId: 'user-123', username: 'testuser' })

    const { middleware } = await import('../../../middleware')
    const req = new NextRequest('http://localhost/api/reports', {
      headers: { cookie: 'session=valid-token' },
    })
    const res = await middleware(req)

    expect(res.status).not.toBe(307)
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects to /login when session cookie is present but JWT is invalid', async () => {
    const { verifyJwt } = await import('../../../lib/auth')
    vi.mocked(verifyJwt).mockResolvedValue(null)

    const { middleware } = await import('../../../middleware')
    const req = new NextRequest('http://localhost/api/settings', {
      headers: { cookie: 'session=expired-or-invalid-token' },
    })
    const res = await middleware(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })
})
