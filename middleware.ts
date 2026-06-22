import { NextRequest, NextResponse } from 'next/server'

// Site-wide basic auth. The domain is public and generation costs money, so the
// whole app (UI + /api/* + /files/*) sits behind one credential.
// Runs on the Edge runtime → use atob, not Buffer.
export function middleware(req: NextRequest) {
  if (process.env.BASIC_AUTH_ENABLED === 'false') return NextResponse.next()

  const user = process.env.BASIC_AUTH_USER
  const pass = process.env.BASIC_AUTH_PASS
  // Not configured (e.g. local dev) → don't lock out.
  if (!user || !pass) return NextResponse.next()

  const header = req.headers.get('authorization')
  if (header?.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6))
      const idx = decoded.indexOf(':')
      const u = decoded.slice(0, idx)
      const p = decoded.slice(idx + 1)
      if (u === user && p === pass) return NextResponse.next()
    } catch {
      /* fall through to 401 */
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="infinity-canvas"' },
  })
}

export const config = {
  // Everything except Next internals and the favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
