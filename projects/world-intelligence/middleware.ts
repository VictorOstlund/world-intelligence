import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt } from './lib/auth'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow auth API routes
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  const cookie = req.cookies.get('session')?.value
  if (!cookie) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const session = await verifyJwt(cookie)
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}
