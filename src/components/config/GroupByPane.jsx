import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'

const AGG_FUNCS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']

// Quick snippet definitions — raw=true means func is a full SQL expression
const SNIPPETS = [
  {
    label: 'COUNT(*)',
    title: 'Conta tutte le righe',
    build: ()       => ({ func: 'COUNT', col: '*', alias: 'totale', raw: false }),
  },
  {
    label: 'COUNT DISTINCT',
    title: 'Conta valori distinti di una colonna',
    build: (allCols) => {
      const c = allCols[0]
      const field = c ? `${c.t}.${c.c}` : ''
      return { func: `COUNT(DISTINCT ${field})`, col: '', alias: 'n_distinti', raw: true }
    },
  },
  {
    label: 'ROW_NUMBER()',
    title: 'Numera le righe della partizione (window function)',
    build: (allCols) => {
      const c = allCols[0]
      const part = c ? `${c.t}.${c.c}` : ''
      return { func: `ROW_NUMBER() OVER(PARTITION BY ${part} ORDER BY ${part})`, col: '', alias: 'rn', raw: true }
    },
  },
  {
    label: 'CASE WHEN',
    title: 'Espressione condizionale',
    build: ()       => ({ func: 'CASE WHEN [cond] THEN [val1] ELSE [val2] END', col: '', alias: 'categoria', raw: true }),
  },
  {
    label: 'COALESCE',
    title: 'Primo valore non-NULL',
    build: (allCols) => {
      const c = allCols[0]
      const field = c ? `${c.t}.${c.c}` : 'col'
      return { func: `COALESCE(${field}, '')`, col: '', alias: 'val', raw: true }
    },
  },
]

export function GroupByPane() {
  const tables = useSchemaStore(s => s.tables)
  const { qTables, qGroupBy, qAggs, toggleGroupBy, addAgg, updateAgg, removeAgg } = useQueryStore()

  if (!qTables.size) return (
    <div className="empty"><div className="ei">∑</div>Seleziona colonne e aggregazioni per il GROUP BY</div>
  )

  const allCols = []
  ;[...qTables].forEach(t => tables[t]?.cols.forEach(c => allCols.push({ t, c: c.name })))

  function addSnippet(s) {
    const agg = s.build(allCols)
    useQueryStore.getState().addAgg()
    const idx = useQueryStore.getState().qAggs.length - 1
    useQueryStore.getState().updateAgg(idx, agg)
  }

  return (
    <div className="gbwrap">
      <div className="gbcol">
        <h4>GROUP BY</h4>
        {allCols.map(x => (
          <label className="gbchk" key={`${x.t}.${x.c}`}>
            <input
              type="checkbox"
              checked={!!qGroupBy.find(g => g.table === x.t && g.col === x.c)}
              onChange={e => toggleGroupBy(x.t, x.c, e.target.checked)}
            />
            {x.t}.{x.c}
          </label>
        ))}
      </div>

      <div className="aggcol">
        <h4>Aggregazioni</h4>

        {/* Quick snippets */}
        <div className="agg-snippets">
          {SNIPPETS.map(s => (
            <button
              key={s.label}
              className="agg-snippet-btn"
              title={s.title}
              onClick={() => addSnippet(s)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {qAggs.map((a, i) => (
          <div className="aggrow" key={i}>
            {a.raw ? (
              /* raw expression: show a text input for the full expression */
              <input
                type="text"
                value={a.func}
                onChange={e => updateAgg(i, { func: e.target.value })}
                style={{ flex: 1, minWidth: 0 }}
                title="Espressione SQL grezza"
              />
            ) : (
              <>
                <select value={a.func} onChange={e => updateAgg(i, { func: e.target.value })}>
                  {AGG_FUNCS.map(f => <option key={f}>{f}</option>)}
                </select>
                <select value={a.col} onChange={e => updateAgg(i, { col: e.target.value })}>
                  <option value="*">* (COUNT)</option>
                  {allCols.map(x => (
                    <option key={`${x.t}.${x.c}`} value={`${x.t}.${x.c}`}>{x.t}.{x.c}</option>
                  ))}
                </select>
              </>
            )}
            AS
            <input
              type="text"
              value={a.alias}
              placeholder="alias"
              onChange={e => updateAgg(i, { alias: e.target.value })}
              style={{ width: 80 }}
            />
            <button className="brm" onClick={() => removeAgg(i)}>×</button>
          </div>
        ))}
        <button className="badd" onClick={addAgg}>+ Aggiungi aggregazione</button>
      </div>
    </div>
  )
}
