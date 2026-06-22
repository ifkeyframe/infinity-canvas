import type { GenerateRequest, GenerateResponse, UploadResponse } from './types'

// All requests are same-origin (Next route handlers). No API key on the client —
// the Replicate token lives only server-side; basic auth protects the site.

export async function getCanvas(): Promise<unknown | null> {
  const res = await fetch('/api/canvas', { method: 'GET', cache: 'no-store' })
  if (res.status === 204) return null
  if (!res.ok) throw new Error('load failed')
  const data = await res.json()
  return data?.snapshot ?? null
}

export async function putCanvas(snapshot: unknown): Promise<void> {
  const res = await fetch('/api/canvas', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot }),
  })
  if (!res.ok) throw new Error('save failed')
}

export async function uploadImage(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'upload failed')
  }
  return res.json()
}

export async function generate(req: GenerateRequest, signal: AbortSignal): Promise<GenerateResponse> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'generate failed')
  }
  return res.json()
}
