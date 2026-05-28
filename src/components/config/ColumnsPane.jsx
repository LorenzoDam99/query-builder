import { useState, useRef } from 'react'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import { DIALECTS } from '../../dialects/index.js'

const WIN_FUNCS = [
  { group: 'Ranking',    funcs: ['ROW_NUMBER','RANK','DENSE_RANK','NTILE','CUME_DIST','PERCENT_RANK'] },
  { group: 'Valore',     funcs: ['LAG','LEAD','FIRST_VALUE','LAST_VALUE','NTH_VALUE'] },
  { group: 'Aggregati',  funcs: ['SUM','AVG','COUNT','MIN','MAX'] },
]
const WIN_FUNC_FLAT = WIN_FUNCS.flatMap(g => g.funcs)
const NO_ARG_FUNCS  = new Set(['ROW_NUMBER','RANK','DENSE_RANK','CUME_DIST','PERCENT_RANK'])

export function ColumnsPane() {
  const tables = useSchemaStore(s => s.tables)
  const {
    qTables, qCols, toggleCol, distinct, setDistinct, limit, setLimit,
    colAliases, setAlias, qColsOrder, moveColOrder, reorderColOrder,
    qCustomCols, addCustomCol, updateCustomCol, removeCustomCol,
    qWindowFuncs, addWindowFunc, updateWindowFunc, removeWindowFunc,
  } = useQueryStore()

  const dragIdx = useRef(null)
  const [dragOver, setDragOver] = useState(null)
  const { dialectId } = useUIStore()
  const dialect = DIALECTS[dialectId]

  const [colSearch, setColSearch] = useState('')

  if (!qTables.size) return (
    <div className="empty"><div className="ei">☑</div>Trascina una tabella nell'ERD per aggiungerla alla query</div>
  )

  const topLabel = dialect.topClause && dialect.topClause(1) ? 'TOP' : 'LIMIT'
  const searchLc = colSearch.toLowerCase()

  return (
    <div>
      <div className="cols-toolbar">
        <label className="cols-opt">
          <input
            type="checkbox"
            checked={distinct}
            onChange={e => setDistinct(e.target.checked)}
          />
          DISTINCT
        </label>
        <label className="cols-opt">
          {topLabel}
          <input
            type="number"
            className="limit-in"
            value={limit}
            min="1"
            placeholder="n"
            onChange={e => setLimit(e.target.value)}
          />
        </label>
        {/* ── Column search filter ── */}
        <input
          type="text"
          className="col-search"
          placeholder="🔍 filtra colonne…"
          value={colSearch}
          onChange={e => setColSearch(e.target.value)}
        />
      </div>

      {/* Column order strip — drag & drop when ≥2 columns selected */}
      {qColsOrder.length >= 2 && (
        <div className="col-order-strip">
          <div className="col-order-label">Ordine SELECT <span className="col-order-hint">trascina per riordinare</span></div>
          <div className="col-order-list">
            {qColsOrder.map((key, i) => {
              const dot = key.indexOf('.')
              const t = key.slice(0, dot), c = key.slice(dot + 1)
              if (!qCols[t]?.has(c)) return null
              return (
                <div
                  className={`col-order-item${dragOver === i ? ' drag-over' : ''}`}
                  key={key}
                  draggable
                  onDragStart={() => { dragIdx.current = i }}
                  onDragEnter={() => setDragOver(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx.current !== null) reorderColOrder(dragIdx.current, i)
                    dragIdx.current = null; setDragOver(null)
                  }}
                  onDragEnd={() => { dragIdx.current = null; setDragOver(null) }}
                >
                  <span className="col-order-grip">⠿</span>
                  <span className="col-order-name">{c}</span>
                  <span className="col-order-table">{t}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="colgrid">
        {[...qTables].map(n => {
          const filtered = (tables[n]?.cols || []).filter(c =>
            !searchLc || c.name.toLowerCase().includes(searchLc)
          )
          if (!filtered.length && searchLc) return null
          return (
            <div className="ctblock" key={n}>
              <h4>{n}{searchLc && ` (${filtered.length})`}</h4>
              {filtered.map(c => {
                const checked = !!(qCols[n] && qCols[n].has(c.name))
                const aliasKey = `${n}.${c.name}`
                return (
                  <div className="cchk" key={c.name}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => toggleCol(n, c.name, e.target.checked)}
                    />
                    <span className="cname" onClick={() => toggleCol(n, c.name, !checked)}>
                      {c.isPK ? '🔑 ' : c.isFK ? '🔗 ' : ''}{c.name}
                    </span>
                    <span className="ctype">{c.type}</span>
                    {checked && (
                      <input
                        type="text"
                        className="alias-in"
                        placeholder="AS…"
                        value={colAliases[aliasKey] || ''}
                        onChange={e => setAlias(aliasKey, e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Calculated / expression columns */}
      <div className="custom-cols-section">
        <div className="custom-cols-hd">
          <span>Colonne calcolate</span>
          <button className="btn btn-s btn-sm" onClick={addCustomCol}>+ Aggiungi</button>
        </div>
        {qCustomCols.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 0' }}>
            Es: <code>prezzo * quantita</code>, <code>UPPER(nome)</code>, <code>CASE WHEN …</code>
          </div>
        )}
        {qCustomCols.map(cc => (
          <div className="custom-col-row" key={cc.id}>
            <input
              className="custom-col-expr"
              type="text"
              placeholder="espressione SQL…"
              value={cc.expr}
              onChange={e => updateCustomCol(cc.id, { expr: e.target.value })}
            />
            <input
              className="custom-col-alias"
              type="text"
              placeholder="AS alias"
              value={cc.alias}
              onChange={e => updateCustomCol(cc.id, { alias: e.target.value })}
            />
            <button className="hist-rm" onClick={() => removeCustomCol(cc.id)} title="Rimuovi">×</button>
          </div>
        ))}
      </div>

      {/* Window functions */}
      <div className="custom-cols-section">
        <div className="custom-cols-hd">
          <span>Window functions</span>
          <button className="btn btn-s btn-sm" onClick={addWindowFunc}>+ Aggiungi</button>
        </div>
        {qWindowFuncs.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--t1)', padding: '4px 0' }}>
            Es: <code>ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC)</code>
          </div>
        )}
        {qWindowFuncs.map(wf => (
          <div className="wf-row" key={wf.id}>
            <div className="wf-row-top">
              <select
                className="wf-sel"
                value={wf.func}
                onChange={e => updateWindowFunc(wf.id, { func: e.target.value })}
              >
                {WIN_FUNCS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.funcs.map(f => <option key={f}>{f}</option>)}
                  </optgroup>
                ))}
              </select>
              {!NO_ARG_FUNCS.has(wf.func) && (
                <input
                  className="wf-col-in"
                  type="text"
                  placeholder="colonna / argomenti"
                  value={wf.col}
                  onChange={e => updateWindowFunc(wf.id, { col: e.target.value })}
                  title="Colonna o lista argomenti es: Orders.Amount, 1, 0"
                />
              )}
              <input
                className="wf-alias-in"
                type="text"
                placeholder="AS alias"
                value={wf.alias}
                onChange={e => updateWindowFunc(wf.id, { alias: e.target.value })}
              />
              <button className="hist-rm" onClick={() => removeWindowFunc(wf.id)} title="Rimuovi">×</button>
            </div>
            <div className="wf-row-over">
              <span className="wf-over-lbl">OVER</span>
              <input
                className="wf-over-in"
                type="text"
                placeholder="PARTITION BY … (opzionale)"
                value={wf.partitionBy}
                onChange={e => updateWindowFunc(wf.id, { partitionBy: e.target.value })}
              />
              <input
                className="wf-over-in"
                type="text"
                placeholder="ORDER BY col ASC (opzionale)"
                value={wf.orderBy}
                onChange={e => updateWindowFunc(wf.id, { orderBy: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
