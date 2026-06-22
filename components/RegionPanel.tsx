'use client'

import { AssetRecordType, createShapeId, Editor, TLShapeId, useValue } from 'tldraw'
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
          // Resolution drives the real box size: keep w === h === resolution.
          onChange={(e) => {
            const n = Number(e.target.value)
            update({ resolution: n, w: n, h: n })
          }}
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
        <div style={{ color: '#ff8787', fontSize: 12 }}>{entry.errorMessage || t.errors.generate}</div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {generating ? (
          <>
            <button style={btn} onClick={() => cancelGeneration(regionId)}>
              {t.panel.cancel}
            </button>
            <span style={{ fontSize: 12, color: '#ffa94d' }}>{t.panel.generating}</span>
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
      <div style={{ fontSize: 11, color: '#6f6f78' }}>{t.panel.setCaption}</div>
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
      if (!editor.getShape(regionId)) return // region deleted mid-generation → drop
      placeResult(editor, regionId, res)
      setRegionStatus(regionId, 'idle')
    })
    .catch((err: unknown) => {
      if (controller.signal.aborted) {
        if (handle.canceled) {
          setRegionStatus(regionId, 'idle')
          showToast(t.errors.canceledPaid, 'info')
        } else {
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

// Captions of image shapes overlapping the region (forgiving for small regions).
function captionsInRegion(editor: Editor, region: RegionShape): string[] {
  const rb = editor.getShapePageBounds(region.id)
  if (!rb) return []
  const caps: string[] = []
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'image') continue
    const b = editor.getShapePageBounds(shape.id)
    if (!b) continue
    if (rb.x < b.maxX && rb.maxX > b.x && rb.y < b.maxY && rb.maxY > b.y) {
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
  const gap = 48
  const x = sb.x + sb.width + gap
  const y = sb.y

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

  // Result region is exactly the output size; the image fills it precisely.
  const resultRegionId = createShapeId()
  editor.createShape({
    id: resultRegionId,
    type: 'region',
    x,
    y,
    props: {
      w: res.width,
      h: res.height,
      name: source.props.name ? `${source.props.name} →` : 'результат',
      resolution: source.props.resolution,
      prompt: '',
    },
  })
  editor.createShape({
    type: 'image',
    x,
    y,
    props: { assetId, w: res.width, h: res.height },
  })
}

// --- dark UI helpers ---------------------------------------------------------

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
        background: '#1b1b20',
        border: '1px solid #2f2f37',
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'inherit',
        color: '#e9e9ec',
      }}
    >
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#9a9aa2' }}>
      <span>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  background: '#27272d',
  border: '1px solid #3a3a44',
  borderRadius: 7,
  color: '#ececf0',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
}

const btn: CSSProperties = {
  padding: '7px 14px',
  borderRadius: 7,
  border: '1px solid #3a3a44',
  background: '#27272d',
  color: '#ececf0',
  cursor: 'pointer',
  fontSize: 13,
}

const btnPrimary: CSSProperties = {
  ...btn,
  border: '1px solid #4263eb',
  background: '#4263eb',
  color: '#fff',
}
