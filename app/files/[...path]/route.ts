import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { resolveFile } from '@/lib/storage'

export const runtime = 'nodejs'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const abs = resolveFile(params.path)
  if (!abs) return new NextResponse('not found', { status: 404 })
  try {
    const buf = await fs.readFile(abs)
    const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('not found', { status: 404 })
  }
}
