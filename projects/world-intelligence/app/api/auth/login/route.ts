import { NextResponse } from 'next/server'
import { getUser } from '../../../../lib/db'
import { verifyPassword, signJwt } from '../../../../lib/auth'

export async function POST(req: Request) {
  let body: { username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const { username, password } = body
  if (!username || !password) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const user = getUser(username)
  if (!user) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const token = await signJwt({ userId: user.id, username: user.username })
  const res = NextResponse.json({ ok: true })
  res.headers.set(
    'set-cookie',
    `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
  )
  return res
}
