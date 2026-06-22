import { Editor, getSnapshot, loadSnapshot } from 'tldraw'
import { getCanvas, putCanvas } from '@/lib/api'
import { showToast } from './toast'
import { t } from '@/lib/strings'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Load the server snapshot, then autosave document changes (debounced) with
// bounded retry. Ephemeral status is not in the store, so it never persists.
export async function setupPersistence(editor: Editor) {
  try {
    const snapshot = await getCanvas()
    if (snapshot) loadSnapshot(editor.store, snapshot as Parameters<typeof loadSnapshot>[1])
  } catch {
    // Corrupt/missing snapshot → start empty (server already backed up a corrupt file).
  }

  let timer: ReturnType<typeof setTimeout> | null = null

  const save = async () => {
    const snapshot = getSnapshot(editor.store)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await putCanvas(snapshot)
        return
      } catch {
        await delay(300 * 2 ** attempt)
      }
    }
    showToast(t.errors.save, 'error')
  }

  editor.store.listen(
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(save, 700)
    },
    { scope: 'document', source: 'user' },
  )
}
