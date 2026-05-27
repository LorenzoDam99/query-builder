import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'

export function OrderByPane() {
  const tables = useSchemaStore(s => s.tables)
  const { qTables, orderBy, addOrderBy, updateOrderBy, removeOrderBy } = useQueryStore()

  if (!qTables.size) return (
    <div className="empty"><div className="ei">↕</div>Aggiungi colonne ORDER BY dopo aver selezionato le tabelle</div>
  )

  const allCols = []
  ;[...qTables].forEach(t => tables[t]?.cols.forEach(c => allCols.push({ t, c: c.name })))

  return (
    <div>
      {orderBy.map((ob, i) => (
        <div className="wrow" key={i}>
          <select
            className="col-sel"
            value={ob.table && ob.col ? `${ob.table}|||${ob.col}` : ''}
            onChange={e => {
              const [t, c] = e.target.value.split('|||')
              updateOrderBy(i, { table: t || '', col: c || '' })
            }}
          >
            <option value="">-- colonna --</option>
            {allCols.map(x => (
              <option key={`${x.t}.${x.c}`} value={`${x.t}|||${x.c}`}>{x.t}.{x.c}</option>
            ))}
          </select>
          <select
            className="dir-sel"
            value={ob.dir || 'ASC'}
            onChange={e => updateOrderBy(i, { dir: e.target.value })}
          >
            <option>ASC</option>
            <option>DESC</option>
          </select>
          <button className="brm" onClick={() => removeOrderBy(i)}>×</button>
        </div>
      ))}
      <button className="badd" onClick={addOrderBy}>+ Aggiungi colonna</button>
    </div>
  )
}
