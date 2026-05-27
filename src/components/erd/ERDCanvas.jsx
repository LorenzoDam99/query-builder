import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import { TableCard } from './TableCard.jsx'
import { RelationLines } from './RelationLines.jsx'
import './ERDCanvas.css'

export function ERDCanvas() {
  const tables = useSchemaStore(s => s.tables)
  const relationships = useSchemaStore(s => s.relationships)
  const schema = useSchemaStore()
  const { qTables, toggleTable } = useQueryStore()
  const {
    zoom, panX, panY, tablePos, needsFit,
    setZoomPan, resetLayout, clearNeedsFit, setTablePos,
    erdHidden, erdSelected, setErdSelected, clearErdSelected,
  } = useUIStore()

  const erdRef = useRef()
  const [, forceUpdate] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const pan = useRef(null)

  const onLinesUpdate = useCallback(() => forceUpdate(n => n + 1), [])

  const tableNames = Object.keys(tables)
  const visibleNames = useMemo(
    () => tableNames.filter(n => !erdHidden.has(n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableNames.join(','), erdHidden]
  )

  // Relationship count per visible table
  const relCountMap = useMemo(() => {
    const map = {}
    visibleNames.forEach(n => { map[n] = 0 })
    relationships.forEach(r => {
      if (!erdHidden.has(r.from.table) && !erdHidden.has(r.to.table)) {
        if (map[r.from.table] !== undefined) map[r.from.table]++
        if (map[r.to.table]   !== undefined) map[r.to.table]++
      }
    })
    return map
  }, [visibleNames, relationships, erdHidden])

  // Tables related to the selected one (visible only)
  const relatedSet = useMemo(() => {
    if (!erdSelected) return new Set()
    const s = new Set()
    relationships.forEach(r => {
      if (r.from.table === erdSelected && !erdHidden.has(r.to.table))   s.add(r.to.table)
      if (r.to.table   === erdSelected && !erdHidden.has(r.from.table)) s.add(r.from.table)
    })
    return s
  }, [erdSelected, relationships, erdHidden])

  // Tables that are in qTables and visible
  const erdTables = useMemo(
    () => visibleNames.filter(n => qTables.has(n)),
    [visibleNames, qTables]
  )

  // canvas size based on qTables (visible)
  let svgW = 800, svgH = 600
  erdTables.forEach(n => {
    const p = tablePos[n] || { x: 0, y: 0 }
    const h = 40 + (tables[n]?.cols.length || 0) * 18
    if (p.x + 220 > svgW) svgW = p.x + 220
    if (p.y + h > svgH)   svgH = p.y + h
  })
  svgW += 60; svgH += 60

  const fitView = useCallback(() => {
    const el = erdRef.current
    if (!erdTables.length || !el) { setZoomPan(1, 0, 0); return }
    const rect = el.getBoundingClientRect()
    const vw = rect.width  || el.clientWidth  || 800
    const vh = rect.height || el.clientHeight || 400
    if (!vw || !vh) return
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0
    erdTables.forEach(n => {
      const p = tablePos[n] || { x: 0, y: 0 }
      const h = 40 + (tables[n]?.cols.length || 0) * 18
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + 205); maxY = Math.max(maxY, p.y + h)
    })
    const cw = maxX - minX + 80, ch = maxY - minY + 80
    const nz = Math.min(1, Math.min(vw / cw, vh / ch))
    setZoomPan(nz, (vw - cw * nz) / 2 - minX * nz + 40 * nz, (vh - ch * nz) / 2 - minY * nz + 40 * nz)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erdTables.join(','), tablePos, setZoomPan])

  const fitViewRef = useRef(fitView)
  fitViewRef.current = fitView

  useEffect(() => {
    if (!needsFit || !erdTables.length) return
    const id = requestAnimationFrame(() => { fitViewRef.current(); clearNeedsFit() })
    return () => cancelAnimationFrame(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFit, erdTables.length, clearNeedsFit])

  // Wheel zoom
  useEffect(() => {
    const el = erdRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const nz = Math.max(0.15, Math.min(3, zoom * factor))
      setZoomPan(nz, mx - (mx - panX) * (nz / zoom), my - (my - panY) * (nz / zoom))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, panX, panY, setZoomPan])

  // ── Pan handlers ──────────────────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.target.closest('.tc')) return
    clearErdSelected()
    pan.current = { sx: e.clientX, sy: e.clientY, ox: panX, oy: panY }
    erdRef.current.style.cursor = 'grabbing'
    e.preventDefault()
  }
  function onMouseMove(e) {
    if (!pan.current) return
    setZoomPan(zoom, pan.current.ox + (e.clientX - pan.current.sx), pan.current.oy + (e.clientY - pan.current.sy))
  }
  function onMouseUp() {
    if (!pan.current) return
    pan.current = null
    if (erdRef.current) erdRef.current.style.cursor = ''
  }

  // ── Drag-and-drop from sidebar ────────────────────────────────────────────
  function onDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  function onDragLeave(e) {
    // Only clear when leaving the erd container itself
    if (!erdRef.current?.contains(e.relatedTarget)) setDragOver(false)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const name = e.dataTransfer.getData('text/plain')
    if (!name || !tables[name]) return

    const rect = erdRef.current.getBoundingClientRect()
    // Convert screen coords → world (ERD) coords
    const wx = (e.clientX - rect.left - panX) / zoom
    const wy = (e.clientY - rect.top  - panY) / zoom

    // Position the card centred on the drop point
    setTablePos(name, Math.max(0, wx - 97), Math.max(0, wy - 20))

    // Make it visible in ERD (remove from erdHidden if it was hidden)
    // useUIStore handles this via toggleErdHidden only when hidden
    const { erdHidden: hidden, toggleErdHidden } = useUIStore.getState()
    if (hidden.has(name)) toggleErdHidden(name)

    // Add to query if not already there
    if (!qTables.has(name)) toggleTable(name, schema)

    onLinesUpdate()
  }

  function zoomBy(factor) {
    const el = erdRef.current
    if (!el) return
    const cx = el.offsetWidth / 2, cy = el.offsetHeight / 2
    const nz = Math.max(0.15, Math.min(3, zoom * factor))
    setZoomPan(nz, cx - (cx - panX) * (nz / zoom), cy - (cy - panY) * (nz / zoom))
  }

  const hasSelection = !!erdSelected
  const hiddenCount  = erdHidden.size

  return (
    <div className="erd-wrap">
      <div className="erd-toolbar">
        <span className="erd-stat">
          {erdTables.length} in query
          {' · '}
          {visibleNames.length}/{tableNames.length} visibili
          {hiddenCount > 0 && <span className="erd-stat-hidden"> ({hiddenCount} nascoste)</span>}
        </span>
        <button className="btn btn-s btn-sm" onClick={() => { resetLayout(tables); onLinesUpdate() }}>↺ Riorganizza</button>
        <button className="btn btn-s btn-sm" onClick={fitView}>⊡ Adatta vista</button>
        <button className="btn btn-s btn-sm" onClick={() => zoomBy(1.2)}>＋</button>
        <span className="zoom-lbl">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-s btn-sm" onClick={() => zoomBy(0.8)}>－</button>
        <span className="erd-hint">Trascina tabella dalla sidebar · Clicca per evidenziare relazioni · Rotella = zoom</span>
      </div>

      <div
        ref={erdRef}
        className={`erd${dragOver ? ' erd-dragover' : ''}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={e => { onMouseUp(); onDragLeave(e) }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {erdTables.length === 0 && !dragOver && (
          <div className="erd-empty">
            <span>Trascina qui una tabella dalla sidebar<br/>oppure clicca una tabella per aggiungerla</span>
          </div>
        )}
        {dragOver && (
          <div className="erd-drop-hint">
            <span>Rilascia per aggiungere all'ERD</span>
          </div>
        )}
        <div
          className="eworld"
          style={{ transform: `translate(${panX}px,${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <RelationLines width={svgW} height={svgH} />
          {erdTables.map(name => (
            <TableCard
              key={name}
              name={name}
              onLinesUpdate={onLinesUpdate}
              isSelected={erdSelected === name}
              isRelated={hasSelection && relatedSet.has(name)}
              isDimmed={hasSelection && erdSelected !== name && !relatedSet.has(name)}
              relCount={relCountMap[name] || 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
