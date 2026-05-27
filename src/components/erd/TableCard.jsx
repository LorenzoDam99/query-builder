import { useRef, useEffect } from 'react'
import { useUIStore } from '../../store/useUIStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import './TableCard.css'

export function TableCard({ name, onLinesUpdate, isSelected, isRelated, isDimmed, relCount }) {
  const tables = useSchemaStore(s => s.tables)
  const schema = useSchemaStore()
  const { qTables, toggleTable } = useQueryStore()
  const { tablePos, setTablePos, zoom, setErdSelected } = useUIStore()

  const table = tables[name]
  const pos = tablePos[name] || { x: 0, y: 0 }
  const inq = qTables.has(name)

  const ref = useRef()
  const drag = useRef(null)

  useEffect(() => {
    const card = ref.current
    if (!card) return

    function onDown(e) {
      // Only drag via header; ignore clicks on the remove button
      if (!e.target.closest('.tc-header')) return
      if (e.target.closest('.tc-remove')) return
      e.preventDefault()
      e.stopPropagation()
      drag.current = {
        sx: e.clientX, sy: e.clientY,
        ox: pos.x, oy: pos.y,
        moved: false,
      }
      card.classList.add('drag')
    }

    function onMove(e) {
      if (!drag.current) return
      const dx = (e.clientX - drag.current.sx) / zoom
      const dy = (e.clientY - drag.current.sy) / zoom
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true
      const nx = Math.max(0, drag.current.ox + dx)
      const ny = Math.max(0, drag.current.oy + dy)
      card.style.left = nx + 'px'
      card.style.top  = ny + 'px'
      onLinesUpdate?.()
    }

    function onUp(e) {
      if (!drag.current) return
      const dx = (e.clientX - drag.current.sx) / zoom
      const dy = (e.clientY - drag.current.sy) / zoom
      setTablePos(name, Math.max(0, drag.current.ox + dx), Math.max(0, drag.current.oy + dy))
      const wasDrag = drag.current.moved
      drag.current = null
      card.classList.remove('drag')
      // Click (no drag) → select table for ERD highlight only
      if (!wasDrag) setErdSelected(name)
    }

    card.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      card.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [name, pos.x, pos.y, zoom, setTablePos, onLinesUpdate, setErdSelected])

  const cls = [
    'tc',
    inq        ? 'inq'       : '',
    isSelected ? 'tc-sel'    : '',
    isRelated  ? 'tc-rel'    : '',
    isDimmed   ? 'tc-dimmed' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={ref}
      id={`card-${name}`}
      className={cls}
      style={{ left: pos.x, top: pos.y }}
      data-table={name}
    >
      <div className="tc-header">
        <div className="tch-dot" />
        <span className="tch-name" title={name}>{name}</span>
        {isSelected && relCount > 0 && (
          <span className="tc-rel-badge" title={`${relCount} relazion${relCount === 1 ? 'e' : 'i'} visibili`}>
            {relCount}
          </span>
        )}
        <button
          className="tc-remove"
          title="Rimuovi dall'ERD"
          onClick={e => { e.stopPropagation(); toggleTable(name, schema) }}
        >
          ×
        </button>
      </div>
      <div className="tcb">
        {table.cols.map(c => (
          <div className="cr" key={c.name}>
            {c.isPK && <span className="ipk">PK</span>}
            {c.isFK && <span className="ifk">FK</span>}
            <span className="cn">{c.name}</span>
            <span className="ct">{c.type}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
