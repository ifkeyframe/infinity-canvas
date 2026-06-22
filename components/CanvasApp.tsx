'use client'

import { useCallback, useState } from 'react'
import {
  AssetRecordType,
  DefaultToolbar,
  DefaultToolbarContent,
  Editor,
  TLComponents,
  TLUiOverrides,
  Tldraw,
  TldrawUiMenuItem,
  useIsToolSelected,
  useTools,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { RegionShapeUtil, RegionTool } from './RegionShape'
import { RegionPanel } from './RegionPanel'
import { Toasts } from './toast'
import { setupPersistence } from './persistence'
import { uploadImage } from '@/lib/api'
import { t } from '@/lib/strings'

const shapeUtils = [RegionShapeUtil]
const tools = [RegionTool]

const overrides: TLUiOverrides = {
  tools(editor, toolsObj) {
    toolsObj.region = {
      id: 'region',
      icon: 'geo-rectangle',
      label: t.tool.region,
      kbd: 'r',
      onSelect: () => editor.setCurrentTool('region'),
    }
    return toolsObj
  },
}

const components: TLComponents = {
  Toolbar: (props) => {
    const toolsObj = useTools()
    const isSelected = useIsToolSelected(toolsObj['region'])
    return (
      <DefaultToolbar {...props}>
        <TldrawUiMenuItem {...toolsObj['region']} isSelected={isSelected} />
        <DefaultToolbarContent />
      </DefaultToolbar>
    )
  },
}

export function CanvasApp() {
  const [editor, setEditor] = useState<Editor | null>(null)

  const handleMount = useCallback((editor: Editor) => {
    setEditor(editor)
    // Dev-only handle for debugging in the console.
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      ;(window as unknown as { editor: Editor }).editor = editor
    }
    // Upload dropped/pasted images to the server; store only the /files URL in
    // the asset (keeps canvas.json small and lets files live on the volume).
    editor.registerExternalAssetHandler('file', async ({ file }) => {
      const { url, width, height } = await uploadImage(file)
      return AssetRecordType.create({
        id: AssetRecordType.createId(),
        type: 'image',
        props: {
          name: file.name,
          src: url,
          w: width,
          h: height,
          mimeType: file.type || 'image/png',
          isAnimated: false,
        },
      })
    })
    setupPersistence(editor)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={shapeUtils}
        tools={tools}
        overrides={overrides}
        components={components}
        onMount={handleMount}
      />
      {editor && <RegionPanel editor={editor} />}
      <Toasts />
    </div>
  )
}
