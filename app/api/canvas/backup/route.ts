import { NextResponse } from 'next/server'
import { backupCanvas } from '@/lib/storage'

export const runtime = 'nodejs'

// Called by the client when a stored snapshot is valid JSON but tldraw refuses
// to load it — preserve the file before the next autosave overwrites it.
export async function POST() {
  await backupCanvas()
  return NextResponse.json({ ok: true })
}
