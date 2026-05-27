// Returns [{severity: 'warn'|'error', message: string}]
export function validateQuery(schema, qs) {
  const issues = []
  const { queryType, qTables, qConds, dmlTable, updateSets, dmlMulti, dmlSelectedTables } = qs
  const { relationships } = schema

  if (queryType === 'SELECT') {
    if (!qTables.size) return issues

    // Detect tables that are selected but not reachable via JOINs from the main table
    if (qTables.size > 1) {
      const tableArr = [...qTables]
      const main = tableArr[0]
      const reached = new Set([main])
      let changed = true
      while (changed) {
        changed = false
        relationships.forEach(r => {
          if (!qTables.has(r.from.table) || !qTables.has(r.to.table)) return
          if (reached.has(r.from.table) && !reached.has(r.to.table)) { reached.add(r.to.table); changed = true }
          if (reached.has(r.to.table) && !reached.has(r.from.table)) { reached.add(r.from.table); changed = true }
        })
      }
      const unjoined = tableArr.filter(t => !reached.has(t))
      unjoined.forEach(t =>
        issues.push({ severity: 'warn', message: `Tabella "${t}" non raggiungibile tramite FK — produrrà un prodotto cartesiano` })
      )
    }
  }

  if (queryType === 'UPDATE') {
    if (!dmlTable) return issues
    const validConds = qConds.filter(c => c.col && c.op)
    if (!validConds.length)
      issues.push({ severity: 'error', message: `UPDATE senza WHERE: verranno aggiornate TUTTE le righe di "${dmlTable}"` })
    const validSets = updateSets.filter(s => s.col)
    if (!validSets.length)
      issues.push({ severity: 'warn', message: 'Nessuna colonna SET specificata' })
  }

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

  if (queryType === 'INSERT' && dmlMulti) {
    if (!dmlSelectedTables.length) {
      issues.push({ severity: 'warn', message: 'Nessuna tabella selezionata per INSERT multi-tabella' })
    } else {
      // Check for missing parent tables: if child is selected but parent isn't
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
