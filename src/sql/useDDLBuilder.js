/**
 * DDL generator — produces CREATE TABLE scripts from the loaded schema.
 * Uses per-dialect `ddlColumnDef(col)` method for portable column definitions.
 */

function buildCreateTable(dialect, tableName, table) {
  if (!table?.cols?.length) return `-- ${tableName}: nessuna colonna`
  const q = id => dialect.quoteId(id)

  // For MongoDB, generate a $jsonSchema validator instead of DDL
  if (dialect.id === 'mongodb') {
    const props = table.cols.map(c =>
      `      ${dialect.ddlColumnDef ? dialect.ddlColumnDef(c) : `"${c.name}": { bsonType: "string" }`}`
    )
    const required = table.cols
      .filter(c => c.nullable === false)
      .map(c => `"${c.name}"`)
    const reqLine = required.length ? `,\n      required: [${required.join(', ')}]` : ''
    return (
      `db.createCollection("${tableName}", {\n` +
      `  validator: {\n` +
      `    $jsonSchema: {\n` +
      `      bsonType: "object"${reqLine},\n` +
      `      properties: {\n` +
      `${props.join(',\n')}\n` +
      `      }\n` +
      `    }\n` +
      `  }\n` +
      `})`
    )
  }

  const colDefs = table.cols.map(c =>
    `  ${dialect.ddlColumnDef ? dialect.ddlColumnDef(c) : `${q(c.name)} ${c.type || 'TEXT'}`}`
  )

  // Composite primary key constraint (only when multiple PKs and none is identity)
  const pkCols = table.cols.filter(c => c.isPK && !c.isIdentity)
  const hasPkInline = table.cols.some(c =>
    dialect.ddlColumnDef && dialect.ddlColumnDef(c).toUpperCase().includes('PRIMARY KEY')
  )
  if (pkCols.length > 1 && !hasPkInline) {
    colDefs.push(`  PRIMARY KEY (${pkCols.map(c => q(c.name)).join(', ')})`)
  }

  const lines = [
    `CREATE TABLE ${q(tableName)} (`,
    colDefs.map((d, i) => d + (i < colDefs.length - 1 ? ',' : '')).join('\n'),
    ')',
  ]
  return lines.join('\n')
}

function buildIndexes(dialect, schema) {
  if (dialect.id === 'mongodb') return []
  const q = id => dialect.quoteId(id)
  const lines = []
  const seen = new Set()
  ;(schema.relationships || []).forEach(r => {
    // Index on the FK column (child side)
    const key = `${r.from.table}.${r.from.col}`
    if (seen.has(key)) return
    seen.add(key)
    const idxName = `IX_${r.from.table.replace(/\s+/g,'_')}_${r.from.col}`
    lines.push(`CREATE INDEX ${q(idxName)}\n  ON ${q(r.from.table)} (${q(r.from.col)})`)
  })
  return lines
}

export function buildDDL(dialect, schema) {
  const tableNames = Object.keys(schema.tables || {})
  if (!tableNames.length) return '-- Nessuno schema caricato\n-- Importa uno schema DDL o JSON prima di usare questo modo'

  const blocks = tableNames.map(name => buildCreateTable(dialect, name, schema.tables[name]))
  const indexes = buildIndexes(dialect, schema)
  const sep = '\n\n'
  const ddl = blocks.join(sep)
  if (!indexes.length) return ddl
  const cm = '--'
  return ddl + '\n\n' + cm + ' Indexes\n' + indexes.join('\n')
}

// Re-export for use in schemaDiff
export { buildCreateTable }
