/**
 * Schema diff engine.
 * Compares two schema objects and generates ALTER TABLE migration SQL.
 */

/**
 * Compute the list of change operations between base and current schemas.
 * @param {object} base    { tables: { name: { cols:[] } } }
 * @param {object} current { tables: { name: { cols:[] } } }
 * @returns {Array} ops — ordered list of change descriptors
 */
export function diffSchemas(base, current) {
  const ops = []
  const baseNames = new Set(Object.keys(base.tables || {}))
  const currNames = new Set(Object.keys(current.tables || {}))

  // Newly added tables
  for (const name of currNames) {
    if (!baseNames.has(name)) {
      ops.push({ type: 'addTable', tableName: name, table: current.tables[name] })
    }
  }

  // Dropped tables
  for (const name of baseNames) {
    if (!currNames.has(name)) {
      ops.push({ type: 'dropTable', tableName: name })
    }
  }

  // Modified tables (column-level diff)
  for (const name of baseNames) {
    if (!currNames.has(name)) continue
    const baseCols = new Map((base.tables[name]?.cols || []).map(c => [c.name, c]))
    const currCols = new Map((current.tables[name]?.cols || []).map(c => [c.name, c]))

    // Added columns
    for (const [colName, col] of currCols) {
      if (!baseCols.has(colName)) {
        ops.push({ type: 'addColumn', tableName: name, col })
      }
    }

    // Dropped columns
    for (const [colName] of baseCols) {
      if (!currCols.has(colName)) {
        ops.push({ type: 'dropColumn', tableName: name, colName })
      }
    }

    // Modified columns (type or nullability changed)
    for (const [colName, col] of currCols) {
      if (!baseCols.has(colName)) continue
      const old = baseCols.get(colName)
      const typeChanged = (old.type || '') !== (col.type || '')
      const nullChanged  = old.nullable !== col.nullable
      if (typeChanged || nullChanged) {
        ops.push({ type: 'modifyColumn', tableName: name, col, oldCol: old })
      }
    }
  }

  return ops
}

/**
 * Render the list of ops as a migration SQL script.
 */
export function buildMigration(dialect, base, current) {
  const ops = diffSchemas(base, current)
  if (!ops.length) {
    return dialect.id === 'mongodb'
      ? '// Nessuna differenza rilevata tra i due schemi'
      : '-- Nessuna differenza rilevata tra i due schemi'
  }

  const q  = id => dialect.quoteId(id)
  const cm = dialect.id === 'mongodb' ? '//' : '--'
  const lines = []

  const colDef = col =>
    dialect.ddlColumnDef ? dialect.ddlColumnDef(col) : `${q(col.name)} ${col.type || 'TEXT'}`

  for (const op of ops) {
    switch (op.type) {

      case 'addTable': {
        lines.push(`${cm} ➕ Nuova tabella: ${op.tableName}`)
        if (dialect.id === 'mongodb') {
          lines.push(`db.createCollection("${op.tableName}")`)
        } else {
          const defs = (op.table?.cols || []).map(c => `  ${colDef(c)}`)
          // Composite PK
          const pkCols = (op.table?.cols || []).filter(c => c.isPK && !c.isIdentity)
          if (pkCols.length > 1) defs.push(`  PRIMARY KEY (${pkCols.map(c => q(c.name)).join(', ')})`)
          lines.push(
            `CREATE TABLE ${q(op.tableName)} (\n${defs.join(',\n')}\n)`
          )
        }
        lines.push('')
        break
      }

      case 'dropTable': {
        lines.push(`${cm} ➖ Tabella rimossa: ${op.tableName}`)
        lines.push(dialect.id === 'mongodb'
          ? `db.${op.tableName}.drop()`
          : `DROP TABLE ${q(op.tableName)}`)
        lines.push('')
        break
      }

      case 'addColumn': {
        lines.push(`${cm} ➕ Nuova colonna: ${op.tableName}.${op.col.name}`)
        if (dialect.id === 'mongodb') {
          lines.push(`db.${op.tableName}.updateMany({}, { $set: { "${op.col.name}": null } })`)
        } else {
          const addKw = dialect.id === 'sqlserver' ? 'ADD' : 'ADD COLUMN'
          lines.push(`ALTER TABLE ${q(op.tableName)} ${addKw} ${colDef(op.col)}`)
        }
        lines.push('')
        break
      }

      case 'dropColumn': {
        lines.push(`${cm} ➖ Colonna rimossa: ${op.tableName}.${op.colName}`)
        if (dialect.id === 'mongodb') {
          lines.push(`db.${op.tableName}.updateMany({}, { $unset: { "${op.colName}": "" } })`)
        } else {
          lines.push(`ALTER TABLE ${q(op.tableName)} DROP COLUMN ${q(op.colName)}`)
        }
        lines.push('')
        break
      }

      case 'modifyColumn': {
        const from = op.oldCol.type || '?'
        const to   = op.col.type   || '?'
        lines.push(`${cm} ✏ Colonna modificata: ${op.tableName}.${op.col.name} (${from} → ${to})`)
        if (dialect.id === 'mongodb') {
          lines.push(`${cm} MongoDB: nessun ALTER necessario per cambiamento di tipo`)
        } else if (dialect.id === 'sqlserver') {
          lines.push(`ALTER TABLE ${q(op.tableName)} ALTER COLUMN ${colDef(op.col)}`)
        } else if (dialect.id === 'mysql') {
          lines.push(`ALTER TABLE ${q(op.tableName)} MODIFY COLUMN ${colDef(op.col)}`)
        } else {
          // PostgreSQL, SQLite
          lines.push(`ALTER TABLE ${q(op.tableName)} ALTER COLUMN ${q(op.col.name)} TYPE ${op.col.type}`)
          if (op.col.nullable === false && op.oldCol.nullable !== false) {
            lines.push(`ALTER TABLE ${q(op.tableName)} ALTER COLUMN ${q(op.col.name)} SET NOT NULL`)
          }
        }
        lines.push('')
        break
      }
    }
  }

  return lines.join('\n')
}
