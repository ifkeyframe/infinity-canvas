import Replicate from 'replicate'
import { GENERATE_TIMEOUT_MS } from './constants'

// Single provider seam. When RD-direct / ComfyUI is needed, swap this one
// function — no interface ceremony until a second provider actually exists.
const MODEL = 'retro-diffusion/rd-fast' as const

export function isReplicateConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN
}

export async function generateImage(input: {
  prompt: string
  style?: string
  width: number
  height: number
  seed?: number
}): Promise<{ imageUrl: string }> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

  // NOTE: Replicate's rd-fast input field is `style` (NOT `prompt_style`), and
  // the output is an array — read output[0]. Confirm the exact enum/size ranges
  // from the model schema in the Replicate playground.
  const modelInput: Record<string, unknown> = {
    prompt: input.prompt,
    width: input.width,
    height: input.height,
    num_images: 1,
  }
  if (input.style) modelInput.style = input.style
  if (typeof input.seed === 'number') modelInput.seed = input.seed

  const output = await withTimeout(
    replicate.run(MODEL, { input: modelInput }),
    GENERATE_TIMEOUT_MS,
    'replicate timeout',
  )

  const url = extractUrl(output)
  if (!url) throw new Error('invalid response from model')
  return { imageUrl: url }
}

function extractUrl(output: unknown): string | null {
  const first = Array.isArray(output) ? output[0] : output
  if (!first) return null
  if (typeof first === 'string') return first
  const anyf = first as { url?: unknown }
  if (typeof anyf.url === 'function') {
    const u = (anyf.url as () => unknown)()
    if (typeof u === 'string') return u
    if (u && typeof (u as URL).href === 'string') return (u as URL).href
    return null
  }
  if (typeof anyf.url === 'string') return anyf.url
  return null
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}
