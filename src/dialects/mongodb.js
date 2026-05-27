export const mongodb = {
  id: 'mongodb',
  label: 'MongoDB',
  icon: '🍃',
  supportsSQL: false,
  ilike: false,
  schemaPrefix: false,

  quoteId(name) { return name },
  quoteStr(val) { return `"${val}"` },
  topClause(_n) { return null },
  limitClause(_n) { return null },
  numericTypes: ['int','long','double','decimal','number'],

  paramPlaceholder(name, _idx) { return `@${name}` },
  paramStyle: 'named',

  // MongoDB doesn't have DDL — return a $jsonSchema validator snippet instead
  ddlColumnDef(col) {
    const bsonType = /^(int|long|integer|bigint)$/i.test(col.type) ? 'int'
      : /^(double|float|real|decimal|numeric)$/i.test(col.type) ? 'double'
      : /^(bool|boolean)$/i.test(col.type) ? 'bool'
      : /^(date|datetime|timestamp)$/i.test(col.type) ? 'date'
      : 'string'
    return `"${col.name}": { bsonType: "${bsonType}"${col.nullable === false ? ', required: true' : ''} }`
  },

  beginTx:    '// Start a multi-document transaction\nconst session = db.getMongo().startSession()\nsession.startTransaction()',
  commitTx:   'session.commitTransaction()\nsession.endSession()',
  rollbackTx: 'session.abortTransaction()\nsession.endSession()',

  /**
   * Generates a MongoDB aggregation pipeline from query state.
   * @param {object} schema  { tables, relationships }
   * @param {object} qs      query store state
   * @returns {string}       formatted pipeline string
   */
  generatePipeline(schema, qs) {
    const { qTables, qCols, qConds, qGroupBy, qAggs, jTypes, orderBy, limit } = qs
    const tables = [...qTables]
    if (!tables.length) return '// Seleziona almeno una collection'

    const main = tables[0]
    const lines = [`db.${main}.aggregate([`]

    // $lookup — handles both directions relative to main collection
    schema.relationships.forEach(r => {
      if (!qTables.has(r.from.table) || !qTables.has(r.to.table)) return
      let lookupFrom, localField, foreignField, asName
      if (r.from.table === main) {
        // main holds the FK → lookup the parent
        lookupFrom = r.to.table; localField = r.from.col; foreignField = r.to.col; asName = r.to.table
      } else if (r.to.table === main) {
        // main is the parent → lookup the child collection (1-to-many)
        lookupFrom = r.from.table; localField = r.to.col; foreignField = r.from.col; asName = r.from.table
      } else {
        return
      }
      lines.push(`  {`)
      lines.push(`    $lookup: {`)
      lines.push(`      from: "${lookupFrom}",`)
      lines.push(`      localField: "${localField}",`)
      lines.push(`      foreignField: "${foreignField}",`)
      lines.push(`      as: "${asName}"`)
      lines.push(`    }`)
      lines.push(`  },`)
      lines.push(`  { $unwind: { path: "$${asName}", preserveNullAndEmptyArrays: true } },`)
    })

    // $match (WHERE)
    const matchConds = qConds.filter(c => c.table && c.col && c.op)
    if (matchConds.length) {
      const parts = matchConds.map(c => {
        const field = c.table === main ? c.col : `${c.table}.${c.col}`
        const v = isNaN(c.val) && c.val ? `"${c.val}"` : (c.val || 0)
        switch (c.op) {
          case '=':   return `"${field}": ${v}`
          case '<>':  return `"${field}": { $ne: ${v} }`
          case '>':   return `"${field}": { $gt: ${v} }`
          case '<':   return `"${field}": { $lt: ${v} }`
          case '>=':  return `"${field}": { $gte: ${v} }`
          case '<=':  return `"${field}": { $lte: ${v} }`
          case 'LIKE': return `"${field}": { $regex: "${c.val}", $options: "i" }`
          case 'IN': {
            const vals = (c.val || '').split(',').map(x => x.trim())
              .map(x => isNaN(x) ? `"${x}"` : Number(x))
            return `"${field}": { $in: [${vals.join(', ')}] }`
          }
          case 'IS NULL':     return `"${field}": null`
          case 'IS NOT NULL': return `"${field}": { $ne: null }`
          default: return `"${field}": ${v}`
        }
      })
      lines.push(`  { $match: { ${parts.join(', ')} } },`)
    }

    // $group (GROUP BY + aggregations)
    if (qGroupBy.length || qAggs.length) {
      const idParts = qGroupBy.map(g => {
        const f = g.table === main ? g.col : `${g.table}.${g.col}`
        return `"${g.col}": "$${f}"`
      })
      const accParts = qAggs.map(a => {
        const col = a.col === '*' ? null : a.col
        const field = col ? (col.includes('.') ? col.replace('.', '.') : col) : null
        const aggOp = {
          COUNT: field ? { $sum: 1 } : { $sum: 1 },
          SUM:   { $sum: `$${field}` },
          AVG:   { $avg: `$${field}` },
          MIN:   { $min: `$${field}` },
          MAX:   { $max: `$${field}` },
        }[a.func] || { $sum: 1 }
        return `"${a.alias || a.func}": ${JSON.stringify(aggOp)}`
      })
      lines.push(`  {`)
      lines.push(`    $group: {`)
      lines.push(`      _id: { ${idParts.join(', ')} },`)
      accParts.forEach(p => lines.push(`      ${p},`))
      lines.push(`    }`)
      lines.push(`  },`)
    }

    // $project (SELECT columns) — prefix duplicate column names with tableName_
    const projParts = []
    const seenKeys = new Set()
    tables.forEach(t => {
      const cols = qCols[t] ? [...qCols[t]] : []
      cols.forEach(c => {
        const field = t === main ? c : `${t}.${c}`
        const key = seenKeys.has(c) ? `${t}_${c}` : c
        seenKeys.add(c)
        projParts.push(`"${key}": "$${field}"`)
      })
    })
    if (projParts.length) {
      lines.push(`  {`)
      lines.push(`    $project: {`)
      lines.push(`      _id: 0,`)
      projParts.forEach(p => lines.push(`      ${p},`))
      lines.push(`    }`)
      lines.push(`  },`)
    }

    // $sort (ORDER BY)
    const sortEntries = (orderBy || []).filter(o => o.table && o.col)
    if (sortEntries.length) {
      const parts = sortEntries.map(o => {
        const field = o.table === main ? o.col : `${o.table}.${o.col}`
        return `"${field}": ${o.dir === 'DESC' ? -1 : 1}`
      })
      lines.push(`  { $sort: { ${parts.join(', ')} } },`)
    }

    // $limit
    const limitN = parseInt(limit, 10)
    if (!isNaN(limitN) && limitN > 0) {
      lines.push(`  { $limit: ${limitN} },`)
    }

    lines.push(`])`)
    return lines.join('\n')
  },
}
