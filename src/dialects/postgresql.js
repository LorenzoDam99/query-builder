export const postgresql = {
  id: 'postgresql',
  label: 'PostgreSQL',
  icon: '🐘',
  supportsSQL: true,
  ilike: true,
  schemaPrefix: false,

  quoteId(name) { return `"${name}"` },
  quoteStr(val) { return `'${val}'` },

  topClause(_n) { return null },
  limitClause(n) { return `LIMIT ${n}` },

  numericTypes: ['integer','int','bigint','smallint','decimal','numeric','real','double precision','serial','bigserial','money'],

  serverDefaults: {
    guid:   'gen_random_uuid()',
    now:    'NOW()',
    nowUtc: 'NOW() AT TIME ZONE \'UTC\'',
    today:  'CURRENT_DATE',
  },

  // Positional placeholder: $1, $2, …
  paramPlaceholder(_name, idx) { return `$${idx + 1}` },
  paramStyle: 'positional',

  ddlColumnDef(col) {
    let type = col.type || 'TEXT'
    if (col.isIdentity) type = 'SERIAL'
    const nullable = col.nullable === false ? ' NOT NULL' : ''
    return `"${col.name}" ${type}${nullable}`
  },

  beginTx:    'BEGIN',
  commitTx:   'COMMIT',
  rollbackTx: 'ROLLBACK',
}
