import {
  BaseBoxShapeUtil,
  BaseBoxShapeTool,
  HTMLContainer,
  RecordProps,
  T,
  TLBaseShape,
} from 'tldraw'
import { DEFAULT_SIZE } from '@/lib/constants'
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

// Persisted props only: name / resolution / prompt (+ box w/h). Generation
// status is ephemeral and lives in statusStore, never in these props.
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
    return { w: 320, h: 320, name: '', resolution: DEFAULT_SIZE, prompt: '' }
  }

  override canEdit() {
    return false
  }

  override component(shape: RegionShape) {
    return <RegionComponent shape={shape} />
  }

  override indicator(shape: RegionShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />
  }
}

function RegionComponent({ shape }: { shape: RegionShape }) {
  const entry = useRegionStatus(shape.id)
  const { w, h, name, resolution } = shape.props
  const color =
    entry.status === 'error' ? '#e03131' : entry.status === 'generating' ? '#f08c00' : '#4263eb'
  return (
    <HTMLContainer>
      <div
        style={{
          width: w,
          height: h,
          border: `2px solid ${color}`,
          borderRadius: 6,
          background: 'rgba(66,99,235,0.04)',
          position: 'relative',
          overflow: 'hidden',
          pointerEvents: 'none',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            background: color,
            color: '#fff',
            fontSize: 12,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {name || 'область'}
          </span>
          <span style={{ marginLeft: 'auto', opacity: 0.85 }}>{resolution}px</span>
          {entry.status === 'generating' && <span>⏳</span>}
          {entry.status === 'error' && <span title={entry.errorMessage}>⚠</span>}
        </div>
      </div>
    </HTMLContainer>
  )
}

export class RegionTool extends BaseBoxShapeTool {
  static override id = 'region'
  static override initial = 'idle'
  override shapeType = 'region'
}
