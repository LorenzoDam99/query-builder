export const sqlite = {
  id: 'sqlite',
  label: 'SQLite',
  icon: '🪶',
  supportsSQL: true,
  ilike: false,
  schemaPrefix: false,

  quoteId(name) { return `"${name}"` },
  quoteStr(val) { return `'${val}'` },

  topClause(_n) { return null },
  limitClause(n) { return `LIMIT ${n}` },

  numericTypes: ['integer','int','real','numeric','decimal','float','double'],

  serverDefaults: {
    guid:   null,                  // no built-in UUID without extension
    now:    "datetime('now')",
    nowUtc: "datetime('now')",
    today:  "date('now')",
  },

  paramPlaceholder(_name, _idx) { return '?' },
  paramStyle: 'question',

  ddlColumnDef(col) {
    const type = col.type || 'TEXT'
    const isAutoInt = col.isIdentity || (col.isPK && /^integer$/i.test(type))
    if (isAutoInt) return `"${col.name}" INTEGER PRIMARY KEY AUTOINCREMENT`
    const nullable = col.nullable === false ? ' NOT NULL' : ''
    const pk = col.isPK ? ' PRIMARY KEY' : ''
    return `"${col.name}" ${type}${nullable}${pk}`
  },

  beginTx:    'BEGIN',
  commitTx:   'COMMIT',
  rollbackTx: 'ROLLBACK',
}
