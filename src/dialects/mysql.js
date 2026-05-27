export const mysql = {
  id: 'mysql',
  label: 'MySQL',
  icon: '🐬',
  supportsSQL: true,
  ilike: false,
  schemaPrefix: false,

  quoteId(name) { return `\`${name}\`` },
  quoteStr(val) { return `'${val}'` },

  topClause(_n) { return null },
  limitClause(n) { return `LIMIT ${n}` },

  numericTypes: ['int','integer','bigint','smallint','tinyint','mediumint','decimal','float','double','numeric','year'],

  serverDefaults: {
    guid:   'UUID()',
    now:    'NOW()',
    nowUtc: 'UTC_TIMESTAMP()',
    today:  'CURDATE()',
  },

  // Positional question-mark placeholder
  paramPlaceholder(_name, _idx) { return '?' },
  paramStyle: 'question',

  ddlColumnDef(col) {
    let type = col.type || 'VARCHAR(255)'
    const autoInc = col.isIdentity ? ' AUTO_INCREMENT' : ''
    const nullable = col.nullable === false ? ' NOT NULL' : ''
    const pk = col.isPK && !col.isIdentity ? ' PRIMARY KEY' : ''
    return `\`${col.name}\` ${type}${autoInc}${nullable}${pk}`
  },

  beginTx:    'BEGIN',
  commitTx:   'COMMIT',
  rollbackTx: 'ROLLBACK',
}
