// Generation/output constraints. rd-fast supports 64..384; confirm exact
// per-style ranges from the Replicate model schema when wiring step 6.
export const MIN_SIZE = 64
export const MAX_SIZE = 384
export const DEFAULT_SIZE = 256
export const SIZES = [64, 128, 192, 256, 320, 384] as const

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB
export const GENERATE_TIMEOUT_MS = 120_000 // server-side cap on the Replicate call
export const CLIENT_GENERATE_TIMEOUT_MS = 150_000 // client AbortController (> server)

// Retro Diffusion rd-fast styles (subset of the documented enum; the full list
// must be confirmed from the Replicate model schema at step 6).
export const STYLES = [
  'default',
  'retro',
  'simple',
  'detailed',
  'anime',
  'game_asset',
  'portrait',
  'texture',
  'ui',
  'item_sheet',
  'character_turnaround',
  'low_res',
] as const
export type StyleId = (typeof STYLES)[number]
export const DEFAULT_STYLE: StyleId = 'default'

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SIZE
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)))
}

export function isValidStyle(s: unknown): s is StyleId {
  return typeof s === 'string' && (STYLES as readonly string[]).includes(s)
}
