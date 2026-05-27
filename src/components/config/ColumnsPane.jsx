import { useState } from 'react'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import { DIALECTS } from '../../dialects/index.js'

export function ColumnsPane() {
  const tables = useSchemaStore(s => s.tables)
  const { qTables, qCols, toggleCol, distinct, setDistinct, limit, setLimit, colAliases, setAlias } = useQueryStore()
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
    </div>
  )
}
