import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { saveUpload } from '@/lib/storage'
import { MAX_UPLOAD_BYTES } from '@/lib/constants'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'no file' }, { status: 400 })
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'not an image' }, { status: 415 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'too big' }, { status: 413 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  try {
    const meta = await sharp(buf).metadata()
    const name = await saveUpload(buf, meta.format || 'png')
    return NextResponse.json({
      url: `/files/uploads/${name}`,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    })
  } catch {
    return NextResponse.json({ error: 'invalid image' }, { status: 400 })
  }
}
