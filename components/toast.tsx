'use client'

import { useSyncExternalStore } from 'react'

interface Toast {
  id: number
  msg: string
  kind: 'error' | 'info'
}

let toasts: Toast[] = []
const listeners = new Set<() => void>()
let nextId = 1

function emit() {
  listeners.forEach((l) => l())
}

export function showToast(msg: string, kind: 'error' | 'info' = 'info') {
  const id = nextId++
  toasts = [...toasts, { id, msg, kind }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 4500)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function Toasts() {
  const list = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => toasts,
  )
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {list.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            color: '#fff',
            fontFamily: 'sans-serif',
            fontSize: 13,
            background: t.kind === 'error' ? '#e03131' : '#343a40',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  )
}
