import {
  BaseBoxShapeUtil,
  BaseBoxShapeTool,
  HTMLContainer,
  RecordProps,
  resizeBox,
  T,
  TLBaseShape,
  TLResizeInfo,
} from 'tldraw'
import { DEFAULT_SIZE, snapToSize } from '@/lib/constants'
import { useRegionStatus } from './statusStore'

export type RegionShape = TLBaseShape<
  'region',
  {
    w: number
    h: number
    name: string
    resolution: number
    prompt: string
  }
>

// The box on canvas IS the real output size: w === h === resolution (a valid
// supported size). Generation status is ephemeral (statusStore), not in props.
export class RegionShapeUtil extends BaseBoxShapeUtil<RegionShape> {
  static override type = 'region' as const
  static override props: RecordProps<RegionShape> = {
    w: T.number,
    h: T.number,
    name: T.string,
    resolution: T.number,
    prompt: T.string,
  }

  override getDefaultProps(): RegionShape['props'] {
    return { w: DEFAULT_SIZE, h: DEFAULT_SIZE, name: '', resolution: DEFAULT_SIZE, prompt: '' }
  }

  override canEdit() {
    return false
  }

  // Keep the region square and snapped to a valid output size; resolution tracks it.
  override onResize(shape: RegionShape, info: TLResizeInfo<RegionShape>) {
    const next = resizeBox(shape, info)
    const side = snapToSize(Math.max(next.props.w, next.props.h))
    return { ...next, props: { ...next.props, w: side, h: side, resolution: side } }
  }

  override component(shape: RegionShape) {
    return <RegionComponent shape={shape} />
  }

  override indicator(shape: RegionShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />
  }
}

function RegionComponent({ shape }: { shape: RegionShape }) {
  const entry = useRegionStatus(shape.id)
  const { w, h, name, resolution } = shape.props
  const color =
    entry.status === 'error' ? '#ff6b6b' : entry.status === 'generating' ? '#ffa94d' : '#4dabf7'
  return (
    <HTMLContainer>
      <div style={{ position: 'relative', width: w, height: h, pointerEvents: 'none', fontFamily: 'inherit' }}>
        {/* Floating label above the box, so the box interior is exactly the output size. */}
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: Math.max(w, 140),
            padding: '2px 8px',
            borderRadius: 5,
            background: color,
            color: '#15151a',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || 'область'}</span>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>{resolution}px</span>
          {entry.status === 'generating' && <span>⏳</span>}
          {entry.status === 'error' && <span title={entry.errorMessage}>⚠</span>}
        </div>
        <div
          style={{
            width: '100%',
            height: '100%',
            border: `2px solid ${color}`,
            borderRadius: 4,
            background: 'rgba(120,160,255,0.06)',
          }}
        />
      </div>
    </HTMLContainer>
  )
}

export class RegionTool extends BaseBoxShapeTool {
  static override id = 'region'
  static override initial = 'idle'
  override shapeType = 'region'
}
