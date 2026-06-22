import { useSyncExternalStore } from 'react'
import type { RegionStatus } from '@/lib/types'

// Ephemeral, client-only generation state per region. Deliberately NOT stored in
// the tldraw snapshot (see PLAN.md §3) so it never reaches canvas.json and never
// gets clobbered by another tab's last-write-wins save.
export interface StatusEntry {
  status: RegionStatus
  errorMessage?: string
}

const IDLE: StatusEntry = { status: 'idle' }
const map = new Map<string, StatusEntry>()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function setRegionStatus(id: string, status: RegionStatus, errorMessage?: string) {
  if (status === 'idle') map.delete(id)
  else map.set(id, { status, errorMessage })
  emit()
}

export function getRegionEntry(id: string): StatusEntry {
  return map.get(id) ?? IDLE
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useRegionStatus(id: string): StatusEntry {
  return useSyncExternalStore(
    subscribe,
    () => map.get(id) ?? IDLE,
    () => IDLE,
  )
}
