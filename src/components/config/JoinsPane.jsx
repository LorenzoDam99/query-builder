import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'

const JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL OUTER']

export function JoinsPane() {
  const { relationships } = useSchemaStore()
  const { qTables, jTypes, setJoinType, tableAliases = {}, setTableAlias } = useQueryStore()

  if (!qTables.size) return (
    <div className="empty"><div className="ei">⇌</div>I JOIN vengono suggeriti automaticamente dalle relazioni FK</div>
  )

  const active = relationships.filter(r => qTables.has(r.from.table) && qTables.has(r.to.table))

  // Collect all tables that appear in the query (main + joined)
  const allTables = [...qTables]

  if (!active.length) return (
    <div style={{ padding: '4px 0' }}>
      <div className="empty" style={{ marginBottom: 8 }}><div className="ei">⇌</div>Nessuna relazione FK tra le tabelle selezionate</div>
      <AliasSection tables={allTables} tableAliases={tableAliases} setTableAlias={setTableAlias} />
    </div>
  )

  return (
    <div style={{ padding: '4px 0' }}>
      {active.map((r, i) => {
        const k = `${r.from.table}>${r.to.table}`
        return (
          <div className="jrow" key={i}>
            <select
              className="jsel"
              value={jTypes[k] || 'INNER'}
              onChange={e => setJoinType(k, e.target.value)}
            >
              {JOIN_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <span>JOIN</span>
            <span className="jjt">{r.to.table}</span>
            <span>ON</span>
            <span style={{ color: 'var(--t1)' }}>{r.from.table}.{r.from.col} = {r.to.table}.{r.to.col}</span>
          </div>
        )
      })}
      <AliasSection tables={allTables} tableAliases={tableAliases} setTableAlias={setTableAlias} />
    </div>
  )
}

function AliasSection({ tables, tableAliases, setTableAlias }) {
  return (
    <div className="alias-section">
      <div className="alias-sec-hd">Alias tabelle</div>
      {tables.map(t => (
        <div className="alias-row" key={t}>
          <span className="alias-tbl-name">{t}</span>
          <span className="alias-as">AS</span>
          <input
            type="text"
            className="alias-tbl-in"
            placeholder="alias…"
            value={tableAliases[t] || ''}
            onChange={e => setTableAlias(t, e.target.value)}
            spellCheck={false}
          />
        </div>
      ))}
    </div>
  )
}
