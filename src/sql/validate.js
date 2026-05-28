// Returns [{severity: 'warn'|'error', message: string}]
export function validateQuery(schema, qs, dialectId = 'sqlserver') {
  const issues = []
  const {
    queryType, qTables, qCols = {}, qConds,
    qGroupBy = [], qAggs = [], orderBy = [], qHaving = [],
    dmlTable, updateSets, dmlMulti, dmlSelectedTables,
  } = qs
  const { relationships } = schema

  // ── SELECT ─────────────────────────────────────────────────────────────────
  if (queryType === 'SELECT') {
    if (!qTables.size) return issues

    // ① Unreachable tables → cartesian product
    if (qTables.size > 1) {
      const tableArr = [...qTables]
      const reached = new Set([tableArr[0]])
      let changed = true
      while (changed) {
        changed = false
        relationships.forEach(r => {
          if (!qTables.has(r.from.table) || !qTables.has(r.to.table)) return
          if (reached.has(r.from.table) && !reached.has(r.to.table)) { reached.add(r.to.table); changed = true }
          if (reached.has(r.to.table) && !reached.has(r.from.table)) { reached.add(r.from.table); changed = true }
        })
      }
      tableArr.filter(t => !reached.has(t)).forEach(t =>
        issues.push({ severity: 'warn', message: `Tabella "${t}" non raggiungibile tramite FK — produrrà un prodotto cartesiano` })
      )
    }

    const hasGroupBy = qGroupBy.length > 0
    const hasAggs    = qAggs.length > 0

    // Count how many regular columns are actually selected
    let selectedColCount = 0
    qTables.forEach(t => { selectedColCount += (qCols[t]?.size || 0) })

    // ② Aggregates + normal columns without GROUP BY
    //    (strict DBs reject this; MySQL w/ ONLY_FULL_GROUP_BY also does)
    if (hasAggs && !hasGroupBy && selectedColCount > 0) {
      const sev = dialectId === 'sqlite' ? 'warn' : 'error'
      issues.push({
        severity: sev,
        message: 'Hai aggregati (COUNT, SUM…) e colonne normali senza GROUP BY — aggiungi un GROUP BY o rimuovi le colonne dalla SELECT',
      })
    }

    // ③ GROUP BY present: every selected column must be in GROUP BY
    if (hasGroupBy) {
      const gbSet = new Set(qGroupBy.map(g => `${g.table}.${g.col}`))

      // Strict DBs: error; MySQL + SQLite: warn (they sometimes permit it)
      const sev = (dialectId === 'mysql' || dialectId === 'sqlite') ? 'warn' : 'error'

      qTables.forEach(table => {
        ;(qCols[table] || new Set()).forEach(col => {
          if (!gbSet.has(`${table}.${col}`)) {
            issues.push({
              severity: sev,
              message: `"${col}" è nella SELECT ma non in GROUP BY`,
            })
          }
        })
      })

      // ④ Column in GROUP BY but no longer selected (user deselected it)
      qGroupBy.forEach(g => {
        if (qTables.has(g.table) && !(qCols[g.table]?.has(g.col))) {
          issues.push({
            severity: 'warn',
            message: `"${g.col}" (${g.table}) è in GROUP BY ma non è più nella SELECT — è stata rimossa per errore?`,
          })
        }
      })

      // ⑤ ORDER BY with GROUP BY: each ORDER BY ref must be in GROUP BY or an agg alias
      if (orderBy.length > 0) {
        const aggAliases = new Set(qAggs.map(a => a.alias?.trim()).filter(Boolean))
        orderBy.forEach(o => {
          if (!o.col) return
          const key = `${o.table}.${o.col}`
          if (!gbSet.has(key) && !aggAliases.has(o.col)) {
            issues.push({
              severity: 'warn',
              message: `ORDER BY "${o.col}" non è in GROUP BY né è un alias di aggregato`,
            })
          }
        })
      }
    }

    // ⑥ HAVING without any GROUP BY or aggregates
    if (qHaving.length > 0 && !hasGroupBy && !hasAggs) {
      issues.push({
        severity: 'warn',
        message: 'HAVING presente senza GROUP BY o aggregati — potrebbe non avere effetto',
      })
    }

    // ⑦ ORDER BY references a column that the user deselected (no GROUP BY path already checked above)
    if (!hasGroupBy) {
      orderBy.forEach(o => {
        if (!o.table || !o.col) return
        if (!qTables.has(o.table)) return
        if (!(qCols[o.table]?.has(o.col))) {
          issues.push({
            severity: 'warn',
            message: `ORDER BY "${o.col}" fa riferimento a una colonna rimossa dalla SELECT`,
          })
        }
      })
    }

    // ⑧ ORDER BY / conditions referencing a table that was removed from the query
    orderBy.forEach(o => {
      if (o.table && !qTables.has(o.table)) {
        issues.push({
          severity: 'warn',
          message: `ORDER BY fa riferimento alla tabella "${o.table}" che non è più nella query`,
        })
      }
    })
    qConds.forEach(c => {
      if (c.table && !qTables.has(c.table)) {
        issues.push({
          severity: 'warn',
          message: `Condizione WHERE fa riferimento alla tabella "${c.table}" rimossa dalla query`,
        })
      }
    })
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  if (queryType === 'UPDATE') {
    if (!dmlTable) return issues
    const validConds = qConds.filter(c => c.col && c.op)
    if (!validConds.length)
      issues.push({ severity: 'error', message: `UPDATE senza WHERE: verranno aggiornate TUTTE le righe di "${dmlTable}"` })
    const validSets = updateSets.filter(s => s.col)
    if (!validSets.length)
      issues.push({ severity: 'warn', message: 'Nessuna colonna SET specificata' })
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (queryType === 'DELETE') {
    if (dmlMulti) {
      if (!dmlSelectedTables.length)
        issues.push({ severity: 'warn', message: 'Nessuna tabella selezionata per DELETE multi-tabella' })
    } else {
      if (!dmlTable) return issues
      const validConds = qConds.filter(c => c.col && c.op)
      if (!validConds.length)
        issues.push({ severity: 'error', message: `DELETE senza WHERE: verranno eliminate TUTTE le righe di "${dmlTable}"` })
    }
  }

  // ── INSERT ─────────────────────────────────────────────────────────────────
  if (queryType === 'INSERT' && dmlMulti) {
    if (!dmlSelectedTables.length) {
      issues.push({ severity: 'warn', message: 'Nessuna tabella selezionata per INSERT multi-tabella' })
    } else {
      const selectedSet = new Set(dmlSelectedTables)
      dmlSelectedTables.forEach(t => {
        relationships
          .filter(r => r.from.table === t && r.to.table !== t)
          .forEach(r => {
            if (!selectedSet.has(r.to.table))
              issues.push({
                severity: 'warn',
                message: `"${t}" dipende da "${r.to.table}" via FK (${r.from.col} → ${r.to.col}) — aggiungi "${r.to.table}" per evitare errori di integrità`,
              })
          })
      })
    }
  }

  return issues
}
