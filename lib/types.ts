// Shared contracts between the client and the Next route handlers.
// Single process, so these live here rather than a separate package.

export interface GenerateRequest {
  regionId: string
  prompt: string
  captions: string[]
  width: number
  height: number
  promptStyle?: string
  seed?: number
}

export interface GenerateResponse {
  url: string
  width: number
  height: number
}

export interface UploadResponse {
  url: string
  width: number
  height: number
}

export interface ApiError {
  error: string
}

// Ephemeral, client-only generation state for a region (NOT persisted in the
// tldraw snapshot — see PLAN.md §3).
export type RegionStatus = 'idle' | 'generating' | 'error'
