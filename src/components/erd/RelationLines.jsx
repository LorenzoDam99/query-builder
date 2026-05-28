import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'

function cardRect(name, tablePos) {
  const card = document.getElementById(`card-${name}`)
  const pos = tablePos[name] || { x: 0, y: 0 }
  return {
    x: pos.x,
    y: pos.y,
    w: card?.offsetWidth  || 195,
    h: card?.offsetHeight || 60,
  }
}

/**
 * Pick the best exit/entry points on two rectangles based on their
 * relative positions. Returns { ax, ay, bx, by, horizontal }.
 */
function getConnPoints(a, b) {
  const aCx = a.x + a.w / 2, aCy = a.y + a.h / 2
  const bCx = b.x + b.w / 2, bCy = b.y + b.h / 2

  const dx = bCx - aCx
  const dy = bCy - aCy
  const adx = Math.abs(dx), ady = Math.abs(dy)

  // Decide between horizontal or vertical connection
  // Add a bias toward horizontal when tables are roughly side-by-side
  const useHorizontal = adx * 0.7 >= ady

  let ax, ay, bx, by
  if (useHorizontal) {
    if (dx >= 0) {
      // B is to the right of A
      ax = a.x + a.w; ay = aCy
      bx = b.x;       by = bCy
    } else {
      // B is to the left of A
      ax = a.x;       ay = aCy
      bx = b.x + b.w; by = bCy
    }
    return { ax, ay, bx, by, horizontal: true }
  } else {
    if (dy >= 0) {
      // B is below A
      ax = aCx; ay = a.y + a.h
      bx = bCx; by = b.y
    } else {
      // B is above A
      ax = aCx; ay = a.y
      bx = bCx; by = b.y + b.h
    }
    return { ax, ay, bx, by, horizontal: false }
  }
}

/**
 * Build an S-curve bezier path between two points.
 */
function bezierPath(ax, ay, bx, by, horizontal) {
  if (horizontal) {
    const offset = Math.max(50, Math.abs(bx - ax) * 0.45)
    const sign = bx >= ax ? 1 : -1
    const cx1 = ax + sign * offset, cy1 = ay
    const cx2 = bx - sign * offset, cy2 = by
    return `M${ax},${ay} C${cx1},${cy1} ${cx2},${cy2} ${bx},${by}`
  } else {
    const offset = Math.max(50, Math.abs(by - ay) * 0.45)
    const sign = by >= ay ? 1 : -1
    const cx1 = ax, cy1 = ay + sign * offset
    const cx2 = bx, cy2 = by - sign * offset
    return `M${ax},${ay} C${cx1},${cy1} ${cx2},${cy2} ${bx},${by}`
  }
}

export function RelationLines({ width, height }) {
  const { relationships } = useSchemaStore()
  const { qTables } = useQueryStore()
  const { tablePos, erdSelected, dialectId } = useUIStore()

  // MongoDB has no FK relationships — skip entirely
  if (dialectId === 'mongodb') return null

  const hasSelection = !!erdSelected

  const paths = relationships
    // ── Only draw lines between tables currently in the ERD ──────────────
    .filter(r => qTables.has(r.from.table) && qTables.has(r.to.table))
    .map((r, i) => {
      const a = cardRect(r.from.table, tablePos)
      const b = cardRect(r.to.table,   tablePos)
      if (!a || !b) return null

      const isConnected = hasSelection &&
        (r.from.table === erdSelected || r.to.table === erdSelected)

      let color, opacity, sw, marker
      if (isConnected) {
        color   = '#e8a020'
        opacity = '1'
        sw      = 2.5
        marker  = 'arr-sel'
      } else {
        color   = '#3dba7e'
        opacity = hasSelection ? '0.12' : '0.75'
        sw      = 1.5
        marker  = 'arr-hi'
      }

      const { ax, ay, bx, by, horizontal } = getConnPoints(a, b)
      const d = bezierPath(ax, ay, bx, by, horizontal)

      return (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          opacity={opacity}
          markerEnd={`url(#${marker})`}
          style={{ transition: 'opacity .2s, stroke-width .2s' }}
        />
      )
    })

  return (
    <svg
      id="esvg"
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}
      width={width}
      height={height}
    >
      <defs>
        <marker id="arr-hi" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill="#3dba7e" opacity=".9" />
        </marker>
        <marker id="arr-sel" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
          <polygon points="0 0,7 2.5,0 5" fill="#e8a020" opacity="1" />
        </marker>
      </defs>
      {paths}
    </svg>
  )
}
