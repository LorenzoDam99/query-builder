import { useState, useMemo } from 'react'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import './Sidebar.css'

function EyeOn() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

export function Sidebar({ style }) {
  const [search, setSearch] = useState('')
  const tables     = useSchemaStore(s => s.tables)
  const relationships = useSchemaStore(s => s.relationships)
  const { qTables } = useQueryStore()
  const { erdHidden, toggleErdHidden, showAllErd, hideAllErd, erdSelected } = useUIStore()

  const allNames = Object.keys(tables)
  const names    = allNames.filter(n =>
    !search || n.toLowerCase().includes(search.toLowerCase())
  )
  const visibleCount = allNames.length - erdHidden.size

  // Tables directly related to the ERD-selected table (FK in either direction)
  const relatedNames = useMemo(() => {
    if (!erdSelected) return new Set()
    const s = new Set()
    relationships.forEach(r => {
      if (r.from.table === erdSelected) s.add(r.to.table)
      if (r.to.table   === erdSelected) s.add(r.from.table)
    })
    return s
  }, [erdSelected, relationships])

  function handleDragStart(e, name) {
    e.dataTransfer.setData('text/plain', name)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="sidebar" style={style}>
      <div className="sb-head">
        <div className="sb-title-row">
          <h3>Tabelle</h3>
          {allNames.length > 0 && (
            <span className="sb-vis-chip" title={`${visibleCount} di ${allNames.length} visibili nell'ERD`}>
              👁 {visibleCount}/{allNames.length}
            </span>
          )}
        </div>
        {allNames.length > 0 && (
          <div className="sb-vis-actions">
            <button className="sb-vis-btn" onClick={showAllErd}>Mostra tutte</button>
            <span className="sb-vis-sep">·</span>
            <button className="sb-vis-btn sb-vis-btn-hide" onClick={() => hideAllErd(tables)}>Nascondi tutte</button>
          </div>
        )}
        <input
          className="sb-search"
          type="text"
          placeholder="Cerca tabella…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="sb-list">
        {names.map(n => {
          const hidden  = erdHidden.has(n)
          const inERD   = qTables.has(n)
          const related = relatedNames.has(n)

          // Tooltip context
          let tip = inERD
            ? `${n} — già nell'ERD · trascina per riposizionare`
            : related
              ? `${n} — correlata a ${erdSelected} · trascina per aggiungerla all'ERD`
              : `${n} — trascina per aggiungere all'ERD`

          return (
            <div
              key={n}
              className={[
                'ti',
                inERD   ? 'inq'    : '',
                related ? 'sb-rel' : '',
                hidden  ? 'erd-off': '',
              ].filter(Boolean).join(' ')}
              draggable={true}
              onDragStart={e => handleDragStart(e, n)}
              title={tip}
              // ← No onClick: aggiunta solo via drag
            >
              <div className="ticon" />
              <span className="ti-name">{n}</span>
              <span className="tcnt">{tables[n].cols.length}</span>
              <button
                className={`ti-eye${hidden ? ' ti-eye-off' : ''}`}
                title={hidden ? "Mostra nell'ERD" : "Nascondi dall'ERD"}
                onClick={e => { e.stopPropagation(); toggleErdHidden(n) }}
              >
                {hidden ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
