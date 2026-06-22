'use client'

import {
  AssetRecordType,
  createShapeId,
  Editor,
  TLShapeId,
  useValue,
} from 'tldraw'
import type { CSSProperties, ReactNode } from 'react'
import { RegionShape } from './RegionShape'
import { generate } from '@/lib/api'
import { CLIENT_GENERATE_TIMEOUT_MS, SIZES } from '@/lib/constants'
import type { GenerateResponse } from '@/lib/types'
import { getRegionEntry, setRegionStatus, useRegionStatus } from './statusStore'
import { showToast } from './toast'
import { t } from '@/lib/strings'

const controllers = new Map<TLShapeId, { controller: AbortController; canceled: boolean }>()

export function RegionPanel({ editor }: { editor: Editor }) {
  const selected = useValue('selected', () => editor.getSelectedShapes(), [editor])
  if (selected.length !== 1) return null
  const shape = selected[0]
  if (shape.type === 'region') return <RegionControls editor={editor} regionId={shape.id} />
  if (shape.type === 'image') return <ImageCaption editor={editor} shapeId={shape.id} />
  return null
}

function RegionControls({ editor, regionId }: { editor: Editor; regionId: TLShapeId }) {
  const live = useValue('region', () => editor.getShape(regionId) as RegionShape | undefined, [
    editor,
    regionId,
  ])
  const entry = useRegionStatus(regionId)
  if (!live) return null

  const { name, resolution, prompt } = live.props
  const generating = entry.status === 'generating'
  const update = (props: Partial<RegionShape['props']>) =>
    editor.updateShape({ id: live.id, type: 'region', props })

  return (
    <Panel>
      <Field label={t.panel.name}>
        <input
          value={name}
          placeholder={t.panel.namePlaceholder}
          disabled={generating}
          onChange={(e) => update({ name: e.target.value })}
          style={inputStyle}
        />
      </Field>
      <Field label={t.panel.resolution}>
        <select
          value={resolution}
          disabled={generating}
          onChange={(e) => update({ resolution: Number(e.target.value) })}
          style={inputStyle}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}×{s}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.panel.prompt}>
        <textarea
          value={prompt}
          placeholder={t.panel.promptPlaceholder}
          disabled={generating}
          rows={3}
          onChange={(e) => update({ prompt: e.target.value })}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      {entry.status === 'error' && (
        <div style={{ color: '#e03131', fontSize: 12 }}>{entry.errorMessage || t.errors.generate}</div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {generating ? (
          <>
            <button style={btn} onClick={() => cancelGeneration(regionId)}>
              {t.panel.cancel}
            </button>
            <span style={{ fontSize: 12, color: '#f08c00' }}>{t.panel.generating}</span>
          </>
        ) : (
          <button
            style={btnPrimary}
            disabled={!prompt.trim()}
            onClick={() => startGeneration(editor, regionId)}
          >
            {entry.status === 'error' ? t.panel.retry : t.panel.start}
          </button>
        )}
      </div>
    </Panel>
  )
}

function ImageCaption({ editor, shapeId }: { editor: Editor; shapeId: TLShapeId }) {
  const shape = useValue('img', () => editor.getShape(shapeId), [editor, shapeId])
  if (!shape) return null
  const caption = (shape.meta?.caption as string) || ''
  return (
    <Panel>
      <Field label={t.panel.caption}>
        <input
          value={caption}
          placeholder={t.panel.captionPlaceholder}
          onChange={(e) =>
            editor.updateShape({ id: shapeId, type: shape.type, meta: { ...shape.meta, caption: e.target.value } })
          }
          style={inputStyle}
        />
      </Field>
      <div style={{ fontSize: 11, color: '#868e96' }}>{t.panel.setCaption}</div>
    </Panel>
  )
}

// --- generation flow ---------------------------------------------------------

function startGeneration(editor: Editor, regionId: TLShapeId) {
  const region = editor.getShape(regionId) as RegionShape | undefined
  if (!region) return
  const prompt = region.props.prompt.trim()
  if (!prompt) return
  if (getRegionEntry(regionId).status === 'generating') return

  const captions = captionsInRegion(editor, region)
  const controller = new AbortController()
  const handle = { controller, canceled: false }
  controllers.set(regionId, handle)
  const timeout = setTimeout(() => controller.abort(), CLIENT_GENERATE_TIMEOUT_MS)
  setRegionStatus(regionId, 'generating')

  generate(
    {
      regionId,
      prompt,
      captions,
      width: region.props.resolution,
      height: region.props.resolution,
    },
    controller.signal,
  )
    .then((res) => {
      // Region may have been deleted mid-generation → drop the result.
      if (!editor.getShape(regionId)) return
      placeResult(editor, regionId, res)
      setRegionStatus(regionId, 'idle')
    })
    .catch((err: unknown) => {
      if (controller.signal.aborted) {
        if (handle.canceled) {
          setRegionStatus(regionId, 'idle')
          showToast(t.errors.canceledPaid, 'info')
        } else {
          // client timeout
          setRegionStatus(regionId, 'error', t.errors.generate)
        }
        return
      }
      const msg = err instanceof Error ? err.message : t.errors.generate
      setRegionStatus(regionId, 'error', msg)
    })
    .finally(() => {
      clearTimeout(timeout)
      controllers.delete(regionId)
    })
}

function cancelGeneration(regionId: TLShapeId) {
  const handle = controllers.get(regionId)
  if (handle) {
    handle.canceled = true
    handle.controller.abort()
  }
}

function captionsInRegion(editor: Editor, region: RegionShape): string[] {
  const rb = editor.getShapePageBounds(region.id)
  if (!rb) return []
  const caps: string[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'image') continue
    const b = editor.getShapePageBounds(shape.id)
    if (!b) continue
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    if (cx >= rb.x && cx <= rb.maxX && cy >= rb.y && cy <= rb.maxY) {
      const cap = (shape.meta?.caption as string)?.trim()
      if (cap) caps.push(cap)
    }
  }
  return caps
}

function placeResult(editor: Editor, sourceId: TLShapeId, res: GenerateResponse) {
  const source = editor.getShape(sourceId) as RegionShape | undefined
  const sb = editor.getShapePageBounds(sourceId)
  if (!source || !sb) return
  const gap = 40
  const x = sb.x + sb.width + gap
  const y = sb.y
  const headerH = 28

  const assetId = AssetRecordType.createId()
  editor.createAssets([
    AssetRecordType.create({
      id: assetId,
      type: 'image',
      props: {
        name: 'generated.png',
        src: res.url,
        w: res.width,
        h: res.height,
        mimeType: 'image/png',
        isAnimated: false,
      },
    }),
  ])

  const resultRegionId = createShapeId()
  editor.createShape({
    id: resultRegionId,
    type: 'region',
    x,
    y,
    props: {
      w: res.width + 16,
      h: res.height + headerH + 8,
      name: source.props.name ? `${source.props.name} →` : 'результат',
      resolution: source.props.resolution,
      prompt: '',
    },
  })
  editor.createShape({
    type: 'image',
    x: x + 8,
    y: y + headerH,
    props: { assetId, w: res.width, h: res.height },
  })
}

// --- small UI helpers --------------------------------------------------------

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 280,
        zIndex: 500,
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'sans-serif',
      }}
    >
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#495057' }}>
      <span>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ced4da',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
}

const btn: CSSProperties = {
  padding: '7px 14px',
  borderRadius: 6,
  border: '1px solid #ced4da',
  background: '#f8f9fa',
  cursor: 'pointer',
  fontSize: 13,
}

const btnPrimary: CSSProperties = {
  ...btn,
  border: '1px solid #4263eb',
  background: '#4263eb',
  color: '#fff',
}
