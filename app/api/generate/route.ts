import { NextRequest, NextResponse } from 'next/server'
import { clampSize, isValidStyle } from '@/lib/constants'
import { saveGenerated } from '@/lib/storage'
import { postprocessPixelArt, makeDummyPng } from '@/lib/pixelart'
import { generateImage, isReplicateConfigured } from '@/lib/replicate'
import type { GenerateRequest } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  let body: Partial<GenerateRequest>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const prompt = (body.prompt || '').trim()
  if (!prompt) return NextResponse.json({ error: 'empty prompt' }, { status: 400 })

  const width = clampSize(Number(body.width))
  const height = clampSize(Number(body.height))
  const style = isValidStyle(body.promptStyle) ? body.promptStyle : undefined
  const seed = typeof body.seed === 'number' ? body.seed : undefined
  const captions = Array.isArray(body.captions)
    ? body.captions.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : []
  const finalPrompt = [prompt, ...captions].join(', ')

  try {
    let png: Buffer
    if (isReplicateConfigured()) {
      const { imageUrl } = await generateImage({ prompt: finalPrompt, style, width, height, seed })
      const res = await fetch(imageUrl)
      if (!res.ok) throw new Error('failed to download result')
      png = await postprocessPixelArt(Buffer.from(await res.arrayBuffer()), { width, height })
    } else {
      // Step-5 fallback: works end-to-end with no token / no spend.
      png = await makeDummyPng(width, height, finalPrompt)
    }
    const name = await saveGenerated(png)
    return NextResponse.json({ url: `/files/generated/${name}`, width, height })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'generation failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
