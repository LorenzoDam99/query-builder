import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useSchemaStore } from '../../store/useSchemaStore.js'

const OPS = ['=', '<>', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL']
const NO_VAL = ['IS NULL', 'IS NOT NULL']

/**
 * Modal for building a subquery used in IN_SUBQUERY WHERE conditions.
 * The subquery descriptor: { table, col, conds: [{conn, col, op, val}] }
 */
export function SubqueryModal({ cond, onSave, onClose }) {
  const tables = useSchemaStore(s => s.tables)
  const tableNames = Object.keys(tables)

  const existing = cond?.subquery || {}
  const [table,  setTable]  = useState(existing.table  || tableNames[0] || '')
  const [col,    setCol]    = useState(existing.col    || '')
  const [conds,  setConds]  = useState(existing.conds  || [])

  const cols = tables[table]?.cols || []

  function addCond() {
    setConds(prev => [...prev, { conn: 'AND', col: cols[0]?.name || '', op: '=', val: '' }])
  }

  function updateCond(i, patch) {
    setConds(prev => {
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  function removeCond(i) {
    setConds(prev => prev.filter((_, idx) => idx !== i))
  }

  function handleSave() {
    onSave({ table, col: col || (cols[0]?.name || '*'), conds })
  }

  return createPortal(
    <div className="subq-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="subq-modal">
        <div className="subq-hd">
          <span>⊂ Subquery — <code>IN (SELECT …)</code></span>
          <button className="hist-close" onClick={onClose}>✕</button>
        </div>

        <div className="subq-body">
          {/* Table selector */}
          <div className="dml-row" style={{ marginBottom: 10 }}>
            <label className="dml-lbl">FROM</label>
            <select
              className="dml-tbl-sel"
              value={table}
              onChange={e => { setTable(e.target.value); setCol(''); setConds([]) }}
            >
              {tableNames.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>

          {/* Column selector */}
          <div className="dml-row" style={{ marginBottom: 10 }}>
            <label className="dml-lbl">SELECT</label>
            <select
              className="dml-tbl-sel"
              value={col}
              onChange={e => setCol(e.target.value)}
            >
              <option value="*">* (tutti)</option>
              {cols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          {/* WHERE conditions */}
          <div className="dml-sub-hd" style={{ marginBottom: 6 }}>WHERE (opzionale)</div>
          {conds.map((c, i) => (
            <div className="wrow" key={i}>
              {i > 0 && (
                <select className="conn" value={c.conn} onChange={e => updateCond(i, { conn: e.target.value })}>
                  <option>AND</option>
                  <option>OR</option>
                </select>
              )}
              <select
                className="col-sel"
                value={c.col}
                onChange={e => updateCond(i, { col: e.target.value })}
              >
                {cols.map(col => <option key={col.name} value={col.name}>{col.name}</option>)}
              </select>
              <select
                className="op-sel"
                value={c.op}
                onChange={e => updateCond(i, { op: e.target.value, val: '' })}
              >
                {OPS.map(o => <option key={o}>{o}</option>)}
              </select>
              {!NO_VAL.includes(c.op) && (
                <input
                  className="val"
                  type="text"
                  value={c.val || ''}
                  placeholder="valore"
                  onChange={e => updateCond(i, { val: e.target.value })}
                />
              )}
              <button className="brm" onClick={() => removeCond(i)}>×</button>
            </div>
          ))}
          <button className="badd" onClick={addCond}>+ Condizione</button>
        </div>

        <div className="subq-footer">
          <div className="subq-preview">
            <code>
              {`SELECT ${col || '*'} FROM ${table || '…'}${conds.length ? ' WHERE …' : ''}`}
            </code>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-s btn-sm" onClick={onClose}>Annulla</button>
            <button className="btn btn-p btn-sm" onClick={handleSave}>✓ Applica</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
