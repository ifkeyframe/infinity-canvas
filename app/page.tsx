'use client'

import dynamic from 'next/dynamic'

// tldraw needs the browser; never SSR it.
const CanvasApp = dynamic(() => import('@/components/CanvasApp').then((m) => m.CanvasApp), {
  ssr: false,
})

export default function Page() {
  return <CanvasApp />
}
