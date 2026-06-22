import { NextRequest, NextResponse } from 'next/server'
import { readCanvas, writeCanvas } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const snapshot = await readCanvas()
  if (snapshot == null) return new NextResponse(null, { status: 204 })
  return NextResponse.json({ snapshot })
}

export async function PUT(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || !('snapshot' in body)) {
    return NextResponse.json({ error: 'missing snapshot' }, { status: 400 })
  }
  try {
    await writeCanvas((body as { snapshot: unknown }).snapshot)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'write failed' }, { status: 500 })
  }
}
