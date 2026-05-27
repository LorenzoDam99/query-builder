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

export function buildDDL(dialect, schema) {
  const tableNames = Object.keys(schema.tables || {})
  if (!tableNames.length) return '-- Nessuno schema caricato\n-- Importa uno schema DDL o JSON prima di usare questo modo'

  const blocks = tableNames.map(name => buildCreateTable(dialect, name, schema.tables[name]))
  const sep = dialect.id === 'mongodb' ? '\n\n' : '\n\n'
  return blocks.join(sep)
}

// Re-export for use in schemaDiff
export { buildCreateTable }
