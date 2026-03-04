import { describe, it, expect, beforeAll } from 'vitest'

let hashPassword: (plain: string) => Promise<string>
let verifyPassword: (plain: string, hash: string) => Promise<boolean>
let signJwt: (payload: { userId: string; username: string }) => Promise<string>
let verifyJwt: (token: string) => Promise<{ userId: string; username: string } | null>

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-minimum-32-chars-long!!'
  const auth = await import('../../../lib/auth')
  hashPassword = auth.hashPassword
  verifyPassword = auth.verifyPassword
  signJwt = auth.signJwt
  verifyJwt = auth.verifyJwt
})

describe('Password hashing', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('mypassword')
    expect(hash).not.toBe('mypassword')
    expect(hash.startsWith('$2')).toBe(true)
    const ok = await verifyPassword('mypassword', hash)
    expect(ok).toBe(true)
  })

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correcthorse')
    const ok = await verifyPassword('wrongpassword', hash)
    expect(ok).toBe(false)
  })
})

describe('JWT sign/verify', () => {
  it('signs a token and verifies it', async () => {
    const token = await signJwt({ userId: 'u1', username: 'admin' })
    expect(typeof token).toBe('string')
    const payload = await verifyJwt(token)
    expect(payload?.userId).toBe('u1')
    expect(payload?.username).toBe('admin')
  })

  it('returns null for an invalid token', async () => {
    const result = await verifyJwt('not.a.valid.token')
    expect(result).toBeNull()
  })

  it('returns null for a tampered token', async () => {
    const token = await signJwt({ userId: 'u1', username: 'admin' })
    const tampered = token.slice(0, -5) + 'XXXXX'
    const result = await verifyJwt(tampered)
    expect(result).toBeNull()
  })
})
