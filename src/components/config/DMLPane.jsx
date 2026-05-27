import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import { DIALECTS } from '../../dialects/index.js'
import { topoSort } from '../../sql/topoSort.js'

const OPS = ['=', '<>', '>', '<', '>=', '<=', 'IS NULL', 'IS NOT NULL']
const NO_VAL = ['IS NULL', 'IS NOT NULL']

// ── Smart INSERT row ──────────────────────────────────────────────────────────

function InsertColRow({ col, value, onChange, dialect, dialectId }) {
  const type = (col.type || '').toLowerCase()

  // Auto-increment / identity → exclude from INSERT, show badge only
  const isAuto = col.isIdentity ||
    (dialectId === 'sqlite' && col.isPK && type === 'integer')

  if (isAuto) {
    return (
      <div className="ins-row ins-row-auto">
        <span className="ins-col ins-col-auto">
          {col.isPK ? '🔑 ' : ''}<span className="ins-col-name">{col.name}</span>
          <span className="ctype"> {col.type}</span>
        </span>
        <span className="ins-auto-chip">🔁 auto</span>
      </div>
    )
  }

  const sd = dialect?.serverDefaults || {}

  // Collect applicable server-default function suggestions
  const fns = []
  const isGuidType = col.isGuid || /^(uniqueidentifier|uuid)$/.test(type)
  const isDateType  = /date|time|timestamp/.test(type)

  if (isGuidType && sd.guid)   fns.push({ label: sd.guid,   val: sd.guid })
  if (isDateType && sd.now)    fns.push({ label: sd.now,    val: sd.now  })
  if (isDateType && sd.nowUtc) fns.push({ label: sd.nowUtc, val: sd.nowUtc })
  if (isDateType && sd.today)  fns.push({ label: sd.today,  val: sd.today })

  // If the column has a known function default and it's not already listed, add it
  if (col.defaultVal && /^\w[\w.]*\(\)$/.test(col.defaultVal)) {
    if (!fns.find(f => f.val === col.defaultVal))
      fns.push({ label: col.defaultVal, val: col.defaultVal })
  }

  const activeVal = fns.find(f => f.val === value)

  return (
    <div className="ins-row">
      <span className="ins-col">
        {col.isPK ? '🔑 ' : col.isFK ? '🔗 ' : ''}
        <span className="ins-col-name">{col.name}</span>
        <span className="ctype"> {col.type}</span>
      </span>
      <div className="ins-val-area">
        {fns.map(fn => (
          <button
            key={fn.val}
            type="button"
            className={`ins-fn-btn${value === fn.val ? ' active' : ''}`}
            onClick={() => onChange(value === fn.val ? '' : fn.val)}
            title={`Usa ${fn.val}`}
          >
            {fn.label}
          </button>
        ))}
        {!activeVal && (
          <input
            type="text"
            className="ins-val"
            placeholder={col.nullable ? 'valore (opzionale)' : 'valore'}
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  )
}

// ── Main DML pane ─────────────────────────────────────────────────────────────

export function DMLPane() {
  const tables      = useSchemaStore(s => s.tables)
  const relationships = useSchemaStore(s => s.relationships)
  const dialectId   = useUIStore(s => s.dialectId)
  const dialect     = DIALECTS[dialectId]
  const {
    queryType,
    dmlTable, setDmlTable,
    insertVals, setInsertVal,
    updateSets, addUpdateSet, updateUpdateSet, removeUpdateSet,
    qConds, addCond, updateCond, removeCond,
    dmlMulti, setDmlMulti,
    dmlSelectedTables, toggleDmlTable,
    insertValsByTable, setInsertValForTable,
  } = useQueryStore()

  const tableNames = Object.keys(tables)
  const topoOrder  = topoSort(tableNames, relationships)
  const deleteOrder = [...topoOrder].reverse()

  function addDmlCond() {
    addCond()
    const idx = useQueryStore.getState().qConds.length - 1
    updateCond(idx, { table: dmlTable })
  }

  const cols = tables[dmlTable]?.cols || []
  const supportsMulti = queryType === 'INSERT' || queryType === 'DELETE'

  return (
    <div className="dmlpane">
      {/* FK-aware multi-table toggle */}
      {supportsMulti && tableNames.length > 1 && (
        <div className="dml-multi-toggle">
          <label className="dml-multi-lbl">
            <input type="checkbox" checked={dmlMulti} onChange={e => setDmlMulti(e.target.checked)} />
            FK-aware multi-tabella
          </label>
          {dmlMulti && (
            <span className="dml-multi-hint">
              {queryType === 'INSERT' ? 'ordine: genitori → figli' : 'ordine: figli → genitori'}
            </span>
          )}
        </div>
      )}

      {/* Single-table selector */}
      {!dmlMulti && (
        <div className="dml-row">
          <label className="dml-lbl">Tabella</label>
          <select className="dml-tbl-sel" value={dmlTable} onChange={e => setDmlTable(e.target.value)}>
            <option value="">-- seleziona --</option>
            {tableNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {/* Single INSERT */}
      {!dmlMulti && dmlTable && queryType === 'INSERT' && (
        <div className="dml-insert">
          <div className="dml-sub-hd">Valori da inserire</div>
          <div className="ins-grid">
            {cols.map(c => (
              <InsertColRow
                key={c.name}
                col={c}
                value={insertVals[c.name] || ''}
                onChange={v => setInsertVal(c.name, v)}
                dialect={dialect}
                dialectId={dialectId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Single UPDATE */}
      {!dmlMulti && dmlTable && queryType === 'UPDATE' && (
        <div>
          <div className="dml-sub-hd">SET — colonne da aggiornare</div>
          {updateSets.map((s, i) => (
            <div className="wrow" key={i}>
              <select className="col-sel" value={s.col} onChange={e => updateUpdateSet(i, { col: e.target.value })}>
                <option value="">-- colonna --</option>
                {cols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <span className="dml-eq">=</span>
              <input
                type="text" className="val"
                placeholder="nuovo valore"
                value={s.val}
                onChange={e => updateUpdateSet(i, { val: e.target.value })}
              />
              <button className="brm" onClick={() => removeUpdateSet(i)}>×</button>
            </div>
          ))}
          <button className="badd" onClick={addUpdateSet}>+ Aggiungi colonna SET</button>
          <div className="dml-sub-hd" style={{ marginTop: 12 }}>WHERE — condizioni (opzionale)</div>
          <DmlWhere cols={cols} dmlTable={dmlTable} qConds={qConds}
            addCond={addDmlCond} updateCond={updateCond} removeCond={removeCond} />
        </div>
      )}

      {/* Single DELETE */}
      {!dmlMulti && dmlTable && queryType === 'DELETE' && (
        <div>
          <div className="dml-warn">⚠ Senza WHERE verranno eliminate TUTTE le righe di {dmlTable}.</div>
          <div className="dml-sub-hd">WHERE — condizioni</div>
          <DmlWhere cols={cols} dmlTable={dmlTable} qConds={qConds}
            addCond={addDmlCond} updateCond={updateCond} removeCond={removeCond} />
        </div>
      )}

      {/* Multi INSERT */}
      {dmlMulti && queryType === 'INSERT' && (
        <div className="dml-multi-body">
          <div className="dml-sub-hd">Tabelle (ordine FK-safe)</div>
          {topoOrder.map(tName => {
            const checked = dmlSelectedTables.includes(tName)
            const tCols = tables[tName]?.cols || []
            const tVals = insertValsByTable[tName] || {}
            return (
              <div key={tName} className={`multi-tbl-block${checked ? ' selected' : ''}`}>
                <label className="multi-tbl-hd">
                  <input type="checkbox" checked={checked} onChange={() => toggleDmlTable(tName)} />
                  <span className="multi-tbl-name">{tName}</span>
                </label>
                {checked && (
                  <div className="ins-grid" style={{ marginTop: 6 }}>
                    {tCols.map(c => (
                      <InsertColRow
                        key={c.name}
                        col={c}
                        value={tVals[c.name] || ''}
                        onChange={v => setInsertValForTable(tName, c.name, v)}
                        dialect={dialect}
                        dialectId={dialectId}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Multi DELETE */}
      {dmlMulti && queryType === 'DELETE' && (
        <div className="dml-multi-body">
          <div className="dml-warn">⚠ Le tabelle selezionate verranno svuotate nell'ordine FK-safe.</div>
          <div className="dml-sub-hd">Tabelle (ordine FK-safe)</div>
          {deleteOrder.map(tName => {
            const checked = dmlSelectedTables.includes(tName)
            return (
              <div key={tName} className={`multi-tbl-block${checked ? ' selected' : ''}`}>
                <label className="multi-tbl-hd">
                  <input type="checkbox" checked={checked} onChange={() => toggleDmlTable(tName)} />
                  <span className="multi-tbl-name">{tName}</span>
                </label>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DML WHERE sub-component ───────────────────────────────────────────────────

function DmlWhere({ cols, dmlTable, qConds, addCond, updateCond, removeCond }) {
  return (
    <div>
      {qConds.map((cond, i) => (
        <div className="wrow" key={i}>
          {i > 0 && (
            <select className="conn" value={cond.conn} onChange={e => updateCond(i, { conn: e.target.value })}>
              <option>AND</option>
              <option>OR</option>
            </select>
          )}
          <select className="col-sel" value={cond.col} onChange={e => updateCond(i, { table: dmlTable, col: e.target.value })}>
            <option value="">-- colonna --</option>
            {cols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select className="op-sel" value={cond.op} onChange={e => updateCond(i, { op: e.target.value })}>
            {OPS.map(o => <option key={o}>{o}</option>)}
          </select>
          {!NO_VAL.includes(cond.op) && (
            <input className="val" type="text" value={cond.val || ''} placeholder="valore"
              onChange={e => updateCond(i, { val: e.target.value })} />
          )}
          <button className="brm" onClick={() => removeCond(i)}>×</button>
        </div>
      ))}
      <button className="badd" onClick={addCond}>+ Aggiungi condizione</button>
    </div>
  )
}
