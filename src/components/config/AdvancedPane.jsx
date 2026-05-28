import { useQueryStore } from '../../store/useQueryStore.js'

export function AdvancedPane() {
  const {
    qCTEs,     addCTE,      updateCTE,      removeCTE,
    qSubqueries, addSubquery, updateSubquery, removeSubquery,
    qUnions,   addUnion,    updateUnion,    removeUnion,
  } = useQueryStore()

  return (
    <div className="adv-pane">

      {/* ── CTE ────────────────────────────────────────────────────────── */}
      <div className="adv-section">
        <div className="adv-section-hd">
          <span className="adv-section-title">CTE — <code>WITH … AS (…)</code></span>
          <button className="btn btn-s btn-sm" onClick={addCTE}>+ Aggiungi</button>
        </div>
        <div className="adv-hint">
          Definisci sotto-query nominabili riutilizzabili nella SELECT principale.
          Il nome può essere usato come tabella nel FROM o nei JOIN.
        </div>
        {qCTEs.map(cte => (
          <div className="adv-block" key={cte.id}>
            <div className="adv-block-row">
              <input
                className="adv-name-in"
                type="text"
                placeholder="nome_cte"
                value={cte.name}
                onChange={e => updateCTE(cte.id, { name: e.target.value })}
              />
              <button className="hist-rm" onClick={() => removeCTE(cte.id)} title="Rimuovi">×</button>
            </div>
            <textarea
              className="adv-sql-ta"
              placeholder={'SELECT col1, col2\nFROM tabella\nWHERE condizione'}
              value={cte.rawSQL}
              onChange={e => updateCTE(cte.id, { rawSQL: e.target.value })}
              rows={4}
              spellCheck={false}
            />
          </div>
        ))}
        {qCTEs.length === 0 && (
          <div className="adv-empty">Es: <code>WITH ultimi_ordini AS (SELECT … FROM Orders WHERE …)</code></div>
        )}
      </div>

      {/* ── Sottoquery nel FROM ─────────────────────────────────────────── */}
      <div className="adv-section">
        <div className="adv-section-hd">
          <span className="adv-section-title">Sottoquery nel FROM</span>
          <button className="btn btn-s btn-sm" onClick={addSubquery}>+ Aggiungi</button>
        </div>
        <div className="adv-hint">
          Aggiunge una tabella derivata <code>(SELECT …) AS alias</code> nella clausola FROM/JOIN.
        </div>
        {qSubqueries.map(sub => (
          <div className="adv-block" key={sub.id}>
            <div className="adv-block-row">
              <select
                className="adv-join-sel"
                value={sub.joinType}
                onChange={e => updateSubquery(sub.id, { joinType: e.target.value })}
              >
                <option>LEFT JOIN</option>
                <option>INNER JOIN</option>
                <option>CROSS JOIN</option>
              </select>
              <input
                className="adv-name-in"
                type="text"
                placeholder="alias"
                value={sub.alias}
                onChange={e => updateSubquery(sub.id, { alias: e.target.value })}
              />
              <button className="hist-rm" onClick={() => removeSubquery(sub.id)} title="Rimuovi">×</button>
            </div>
            <textarea
              className="adv-sql-ta"
              placeholder={'SELECT id, totale\nFROM Orders\nWHERE anno = 2024'}
              value={sub.rawSQL}
              onChange={e => updateSubquery(sub.id, { rawSQL: e.target.value })}
              rows={3}
              spellCheck={false}
            />
            {sub.joinType !== 'CROSS JOIN' && (
              <input
                className="adv-on-in"
                type="text"
                placeholder="Condizione ON — es: principale.id = alias.fk_id"
                value={sub.joinOn}
                onChange={e => updateSubquery(sub.id, { joinOn: e.target.value })}
              />
            )}
          </div>
        ))}
        {qSubqueries.length === 0 && (
          <div className="adv-empty">Es: <code>LEFT JOIN (SELECT customer_id, SUM(total) AS tot FROM Orders GROUP BY customer_id) AS riepilogo ON …</code></div>
        )}
      </div>

      {/* ── UNION ──────────────────────────────────────────────────────── */}
      <div className="adv-section">
        <div className="adv-section-hd">
          <span className="adv-section-title">UNION / UNION ALL</span>
          <button className="btn btn-s btn-sm" onClick={addUnion}>+ Aggiungi</button>
        </div>
        <div className="adv-hint">
          Aggiunge un operatore UNION dopo la query principale. Le colonne devono corrispondere per numero e tipo.
        </div>
        {qUnions.map((u, i) => (
          <div className="adv-block" key={u.id}>
            <div className="adv-block-row">
              <span className="adv-union-num">#{i + 1}</span>
              <select
                className="adv-join-sel"
                value={u.type}
                onChange={e => updateUnion(u.id, { type: e.target.value })}
              >
                <option value="UNION">UNION</option>
                <option value="UNION ALL">UNION ALL</option>
              </select>
              <button className="hist-rm" onClick={() => removeUnion(u.id)} title="Rimuovi">×</button>
            </div>
            <textarea
              className="adv-sql-ta"
              placeholder={'SELECT id, nome, \'archivio\' AS fonte\nFROM ClientiArchivio\nWHERE attivo = 0'}
              value={u.rawSQL}
              onChange={e => updateUnion(u.id, { rawSQL: e.target.value })}
              rows={3}
              spellCheck={false}
            />
          </div>
        ))}
        {qUnions.length === 0 && (
          <div className="adv-empty">
            <strong>UNION</strong> elimina i duplicati — <strong>UNION ALL</strong> li mantiene (più veloce)
          </div>
        )}
      </div>

    </div>
  )
}
