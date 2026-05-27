export const sqlserver = {
  id: 'sqlserver',
  label: 'SQL Server',
  icon: '🟦',
  supportsSQL: true,
  ilike: false,
  schemaPrefix: false,

  quoteId(name) { return `[${name}]` },
  quoteStr(val) { return `'${val}'` },

  topClause(n) { return `TOP ${n}` },
  limitClause(_n) { return null },

  numericTypes: ['int','bigint','smallint','decimal','float','numeric','money','real','tinyint'],

  serverDefaults: {
    guid:   'NEWID()',
    now:    'GETDATE()',
    nowUtc: 'GETUTCDATE()',
    today:  'CAST(GETDATE() AS DATE)',
  },

  // Named parameter placeholder: @paramName
  paramPlaceholder(name, _idx) { return `@${name}` },
  paramStyle: 'named',   // 'named' | 'positional' | 'question'

  // DDL column definition fragment
  ddlColumnDef(col) {
    let type = col.type || 'NVARCHAR(255)'
    if (col.isIdentity) type += ' IDENTITY(1,1)'
    const nullable = col.nullable === false ? ' NOT NULL' : ' NULL'
    return `[${col.name}] ${type}${nullable}`
  },

  // Transaction keywords
  beginTx:    'BEGIN TRANSACTION',
  commitTx:   'COMMIT TRANSACTION',
  rollbackTx: 'ROLLBACK TRANSACTION',
}
