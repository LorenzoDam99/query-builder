import { useState } from 'react'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { SubqueryModal } from './SubqueryModal.jsx'

const OPS = ['=', '<>', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL', 'IN_SUBQUERY']
const NO_VAL = ['IS NULL', 'IS NOT NULL', 'IN_SUBQUERY']
const HAVING_OPS = ['=', '<>', '>', '<', '>=', '<=']
const AGG_FUNCS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']

const PARAM_TYPES = ['string', 'number', 'boolean', 'date', 'uuid']

export function WherePane() {
  const tables = useSchemaStore(s => s.tables)
  const {
    qTables, qConds, addCond, updateCond, removeCond,
    qGroupBy, qAggs, qHaving, addHaving, updateHaving, removeHaving,
    qParams, addParam, updateParam, removeParam,
  } = useQueryStore()

  const [subqueryIdx, setSubqueryIdx] = useState(null)

  if (!qTables.size) return (
    <div className="empty"><div className="ei">⊘</div>Aggiungi condizioni WHERE dopo aver selezionato le tabelle</div>
  )

  const allCols = []
  ;[...qTables].forEach(t => tables[t]?.cols.forEach(c => allCols.push({ t, c: c.name })))

  const hasGroupBy = qGroupBy.length > 0 || qAggs.length > 0

  return (
    <div>
      {/* ── WHERE conditions ── */}
      {qConds.map((cond, i) => (
        <div className="wrow" key={i}>
          {i > 0 && (
            <select className="conn" value={cond.conn} onChange={e => updateCond(i, { conn: e.target.value })}>
              <option>AND</option>
              <option>OR</option>
            </select>
          )}
          <select
            className="col-sel"
            value={cond.table && cond.col ? `${cond.table}|||${cond.col}` : ''}
            onChange={e => {
              const [t, c] = e.target.value.split('|||')
              updateCond(i, { table: t, col: c })
            }}
          >
            <option value="">-- colonna --</option>
            {allCols.map(x => (
              <option key={`${x.t}.${x.c}`} value={`${x.t}|||${x.c}`}>{x.t}.{x.c}</option>
            ))}
          </select>
          <select className="op-sel" value={cond.op} onChange={e => updateCond(i, { op: e.target.value, val: '', subquery: undefined })}>
            {OPS.map(o => <option key={o}>{o}</option>)}
          </select>
          {cond.op === 'IN_SUBQUERY' ? (
            <button
              className="badd"
              style={{ margin: 0, padding: '3px 9px', fontSize: 11 }}
              onClick={() => setSubqueryIdx(i)}
              title="Configura la subquery"
            >
              {cond.subquery?.table ? `⊂ ${cond.subquery.table}.${cond.subquery.col}` : '⊂ Configura…'}
            </button>
          ) : !NO_VAL.includes(cond.op) ? (
            <input
              className="val"
              type="text"
              value={cond.val || ''}
              placeholder="valore o @param"
              onChange={e => updateCond(i, { val: e.target.value })}
            />
          ) : null}
          <button className="brm" onClick={() => removeCond(i)}>×</button>
        </div>
      ))}
      <button className="badd" onClick={addCond}>+ Aggiungi condizione WHERE</button>

      {/* ── HAVING ── */}
      {hasGroupBy && (
        <>
          <div className="having-sep">HAVING</div>
          {qHaving.map((h, i) => (
            <div className="wrow" key={i}>
              {i > 0 && (
                <select className="conn" value={h.conn} onChange={e => updateHaving(i, { conn: e.target.value })}>
                  <option>AND</option>
                  <option>OR</option>
                </select>
              )}
              <select
                className="agg-sel"
                value={h.aggFunc}
                onChange={e => updateHaving(i, { aggFunc: e.target.value })}
              >
                {AGG_FUNCS.map(f => <option key={f}>{f}</option>)}
              </select>
              <select
                className="col-sel"
                value={h.aggCol}
                onChange={e => updateHaving(i, { aggCol: e.target.value })}
              >
                <option value="*">* (tutti)</option>
                {allCols.map(x => (
                  <option key={`${x.t}.${x.c}`} value={`${x.t}.${x.c}`}>{x.t}.{x.c}</option>
                ))}
              </select>
              <select className="op-sel" value={h.op} onChange={e => updateHaving(i, { op: e.target.value })}>
                {HAVING_OPS.map(o => <option key={o}>{o}</option>)}
              </select>
              <input
                className="val"
                type="text"
                value={h.val || ''}
                placeholder="valore"
                onChange={e => updateHaving(i, { val: e.target.value })}
              />
              <button className="brm" onClick={() => removeHaving(i)}>×</button>
            </div>
          ))}
          <button className="badd" onClick={addHaving}>+ Aggiungi condizione HAVING</button>
        </>
      )}

      {/* ── Query parameters registry ── */}
      <div className="params-section">
        <div className="params-hd">
          <span>Parametri query</span>
          <span className="params-hint">usa @nomeparam nei valori WHERE</span>
        </div>
        {qParams.map((p, i) => (
          <div className="wrow" key={i}>
            <input
              className="val"
              style={{ width: 90 }}
              type="text"
              placeholder="@nome"
              value={p.name}
              onChange={e => updateParam(i, { name: e.target.value })}
            />
            <select
              className="op-sel"
              style={{ width: 80 }}
              value={p.type}
              onChange={e => updateParam(i, { type: e.target.value })}
            >
              {PARAM_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input
              className="val"
              type="text"
              placeholder="esempio"
              value={p.example}
              onChange={e => updateParam(i, { example: e.target.value })}
            />
            <button className="brm" onClick={() => removeParam(i)}>×</button>
          </div>
        ))}
        <button className="badd" onClick={addParam}>+ Aggiungi parametro</button>
      </div>

      {/* ── Subquery modal ── */}
      {subqueryIdx !== null && (
        <SubqueryModal
          cond={qConds[subqueryIdx]}
          onSave={sub => { updateCond(subqueryIdx, { subquery: sub }); setSubqueryIdx(null) }}
          onClose={() => setSubqueryIdx(null)}
        />
      )}
    </div>
  )
}
