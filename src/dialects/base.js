/**
 * Base dialect contract. Every dialect must implement these fields/methods.
 * supportsSQL=false dialects (MongoDB) skip buildSQL and implement generatePipeline.
 */
export const BaseDialect = {
  id: '',
  label: '',
  supportsSQL: true,

  quoteId(name) { return `"${name}"` },
  quoteStr(val) { return `'${val}'` },

  // TOP n  vs  (appended) LIMIT n
  topClause(n) { return null },
  limitClause(n) { return `LIMIT ${n}` },

  // true → PostgreSQL ILIKE instead of LIKE
  ilike: false,

  // true → prefix columns with schema: [dbo].[Table].[col]
  schemaPrefix: false,

  // Numeric types used to filter agg column suggestions
  numericTypes: ['int','bigint','smallint','decimal','float','numeric','money','real','tinyint','double','integer','number'],

  // Icon shown in the dialect selector
  icon: '🗄️',

  // Server-side default expressions used in INSERT (dialect-specific)
  // null means the function is not available in this dialect
  serverDefaults: {
    guid:    null,   // function to generate a new UUID/GUID
    now:     null,   // function for current date+time
    nowUtc:  null,   // UTC variant (optional)
    today:   null,   // date-only variant (optional)
  },
}
