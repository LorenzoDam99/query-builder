import { useMemo } from 'react'
import { useSchemaStore } from '../store/useSchemaStore.js'
import { useQueryStore } from '../store/useQueryStore.js'
import { useUIStore } from '../store/useUIStore.js'
import { DIALECTS } from '../dialects/index.js'
import { topoSort } from './topoSort.js'
import { buildDDL } from './useDDLBuilder.js'
import { buildMigration } from './schemaDiff.js'

// Render a WHERE scalar value: param → raw, expression → raw, number → raw, else quoted
function renderVal(dialect, v) {
  if (!v && v !== 0) return "''"
  if (isParam(v) || isSqlExpr(v)) return v
  return isNaN(v) ? dialect.quoteStr(v) : v
}

// Build WHERE parts — tableRef(t) resolves the table name/alias for expressions
function buildWherePartsAliased(dialect, qConds, tableRef, schema) {
  const likeOp = dialect.ilike ? 'ILIKE' : 'LIKE'
  const q = id => dialect.quoteId(id)
  const parts = []
  qConds.filter(c => c.op).forEach((c, i) => {
    if (!c.table && c.op !== 'IN_SUBQUERY') return
    if (!c.col && c.op !== 'IN_SUBQUERY') return
    let expr
    const col = c.table ? `${tableRef(c.table)}.${q(c.col)}` : q(c.col || '')
    if (['IS NULL', 'IS NOT NULL'].includes(c.op)) {
      expr = `${col} ${c.op}`
    } else if (c.op === 'LIKE') {
      const v = (c.val || '').trim()
      expr = isParam(v)
        ? `${col} ${likeOp} ${v}`
        : `${col} ${likeOp} ${dialect.quoteStr('%' + (c.val || '') + '%')}`
    } else if (c.op === 'IN') {
      if (isParam((c.val || '').trim())) {
        expr = `${col} IN (${(c.val || '').trim()})`
      } else {
        const vals = (c.val || '').split(',').map(v => v.trim())
          .map(v => isNaN(v) ? dialect.quoteStr(v) : v).join(', ')
        expr = `${col} IN (${vals})`
      }
    } else if (c.op === 'IN_SUBQUERY') {
      // Build a nested SELECT from the subquery descriptor
      const sub = c.subquery || {}
      const subTable = sub.table || ''
      const subCol   = sub.col   || '*'
      const subWhere = sub.conds?.length
        ? '\n        WHERE ' + buildDmlWhereParts(dialect, sub.conds).join('\n          ')
        : ''
      expr = `${col} IN (SELECT ${q(subCol)} FROM ${q(subTable)}${subWhere})`
    } else {
      const v = (c.val || '').trim()
      expr = `${col} ${c.op} ${renderVal(dialect, v)}`
    }
    parts.push(i === 0 ? expr : `${c.conn} ${expr}`)
  })
  return parts
}

function buildWhereParts(dialect, qConds) {
  return buildWherePartsAliased(dialect, qConds, t => dialect.quoteId(t))
}

// Single-table DML WHERE: no table prefix (cleaner, standard for UPDATE/DELETE)
function buildDmlWhereParts(dialect, qConds) {
  const likeOp = dialect.ilike ? 'ILIKE' : 'LIKE'
  const q = id => dialect.quoteId(id)
  const parts = []
  qConds.filter(c => c.col && c.op).forEach((c, i) => {
    let expr
    const col = q(c.col)
    if (['IS NULL', 'IS NOT NULL'].includes(c.op)) {
      expr = `${col} ${c.op}`
    } else if (c.op === 'LIKE') {
      const v = (c.val || '').trim()
      expr = isParam(v)
        ? `${col} ${likeOp} ${v}`
        : `${col} ${likeOp} ${dialect.quoteStr('%' + (c.val || '') + '%')}`
    } else if (c.op === 'IN') {
      if (isParam((c.val || '').trim())) {
        expr = `${col} IN (${(c.val || '').trim()})`
      } else {
        const vals = (c.val || '').split(',').map(v => v.trim())
          .map(v => isNaN(v) ? dialect.quoteStr(v) : v).join(', ')
        expr = `${col} IN (${vals})`
      }
    } else {
      const v = (c.val || '').trim()
      expr = `${col} ${c.op} ${renderVal(dialect, v)}`
    }
    parts.push(i === 0 ? expr : `${c.conn} ${expr}`)
  })
  return parts
}

/**
 * Returns true when a value should be rendered as a SQL expression (unquoted).
 * Matches function calls like GETDATE(), NEWID(), gen_random_uuid(), NOW(), etc.
 */
function isSqlExpr(val) {
  if (!val) return false
  return /^[A-Za-z_][\w.]*\s*\([^)]*\)$/.test(val.trim())
}

/**
 * Returns true when a value is a named query parameter (@paramName).
 * Always rendered unquoted so it appears as a proper parameter marker.
 */
function isParam(val) {
  if (!val) return false
  return /^@\w+$/.test((val || '').trim())
}

/** Format an INSERT/UPDATE value: expression|param → unquoted, numeric → unquoted, else quoted. */
function fmtVal(dialect, col, raw) {
  const v = (raw || '').trim()
  if (!v) return dialect.quoteStr('')
  if (isParam(v) || isSqlExpr(v)) return v
  const isNum = dialect.numericTypes?.some(t => col.type?.toLowerCase().startsWith(t)) && !isNaN(v)
  return isNum ? v : dialect.quoteStr(v)
}

export function buildSQL(dialect, schema, qs) {
  const { qTables, qCols, qConds, qGroupBy, qAggs, jTypes,
          distinct, limit, orderBy, colAliases, qHaving, tableAliases = {} } = qs
  const { tables, relationships } = schema
  const q  = id => dialect.quoteId(id)
  // Reference a table in FROM/JOIN declaration: tbl [AS alias]
  const fromRef = t => tableAliases[t] ? `${q(t)} AS ${q(tableAliases[t])}` : q(t)
  // Prefix a table in expressions: use alias if set
  const qa = t => tableAliases[t] ? q(tableAliases[t]) : q(t)

  if (!qTables.size) return '-- Seleziona almeno una tabella\n-- cliccando il titolo nell\'ERD'

  const tableArr = [...qTables]
  const main = tableArr[0]

  // SELECT parts
  const selParts = []
  tableArr.forEach(t => {
    const cols = qCols[t] ? [...qCols[t]] : []
    cols.forEach(c => {
      const isAggCol = qAggs.some(a => a.col === `${t}.${c}`)
      if (!isAggCol) {
        const alias = colAliases[`${t}.${c}`]
        selParts.push(alias
          ? `${qa(t)}.${q(c)} AS ${q(alias)}`
          : `${qa(t)}.${q(c)}`)
      }
    })
  })
  qAggs.forEach(a => {
    // raw=true: func contains the full expression already (e.g. ROW_NUMBER() OVER(...))
    if (a.raw) {
      selParts.push(a.alias ? `${a.func} AS ${q(a.alias)}` : a.func)
      return
    }
    const col = a.col === '*' ? '*'
      : a.col.includes('.')
        ? `${qa(a.col.split('.')[0])}.${q(a.col.split('.')[1])}`
        : a.col
    selParts.push(`${a.func}(${col}) AS ${q(a.alias || a.func)}`)
  })
  if (!selParts.length) selParts.push('*')

  // FROM + JOINs — BFS so each table is introduced exactly once
  const introduced = new Set([main])
  const joins = []
  let changed = true
  while (changed) {
    changed = false
    relationships.forEach(r => {
      if (!qTables.has(r.from.table) || !qTables.has(r.to.table) || r.from.table === r.to.table) return
      const k = `${r.from.table}>${r.to.table}`
      const jt = jTypes[k] || 'INNER'
      if (introduced.has(r.to.table) && !introduced.has(r.from.table)) {
        joins.push(`${jt} JOIN ${fromRef(r.from.table)}\n         ON ${qa(r.from.table)}.${q(r.from.col)} = ${qa(r.to.table)}.${q(r.to.col)}`)
        introduced.add(r.from.table); changed = true
      } else if (introduced.has(r.from.table) && !introduced.has(r.to.table)) {
        joins.push(`${jt} JOIN ${fromRef(r.to.table)}\n         ON ${qa(r.from.table)}.${q(r.from.col)} = ${qa(r.to.table)}.${q(r.to.col)}`)
        introduced.add(r.to.table); changed = true
      }
    })
  }

  // Build WHERE using aliases
  const whereParts = buildWherePartsAliased(dialect, qConds, qa)
  const gbParts = qGroupBy.map(g => `${qa(g.table)}.${q(g.col)}`)

  // HAVING
  const havingParts = []
  qHaving.filter(h => h.aggFunc && h.op).forEach((h, i) => {
    const col = h.aggCol === '*' ? '*'
      : h.aggCol.includes('.')
        ? `${qa(h.aggCol.split('.')[0])}.${q(h.aggCol.split('.')[1])}`
        : h.aggCol
    const v = (h.val || '').trim()
    const fv = isNaN(v) && v ? dialect.quoteStr(v) : v || '0'
    const expr = `${h.aggFunc}(${col}) ${h.op} ${fv}`
    havingParts.push(i === 0 ? expr : `${h.conn} ${expr}`)
  })

  const obParts = orderBy
    .filter(o => o.table && o.col)
    .map(o => `${qa(o.table)}.${q(o.col)} ${o.dir || 'ASC'}`)

  const distinctKw = distinct ? 'DISTINCT ' : ''
  const topStr = limit && dialect.topClause(limit) ? `${dialect.topClause(limit)} ` : ''

  const lines = [`SELECT ${distinctKw}${topStr}`]
  selParts.forEach((p, i) => lines.push(`    ${p}${i < selParts.length - 1 ? ',' : ''}`))
  lines.push(`FROM ${fromRef(main)}`)
  joins.forEach(j => lines.push(`    ${j}`))
  if (whereParts.length) { lines.push('WHERE'); whereParts.forEach(w => lines.push(`    ${w}`)) }
  if (gbParts.length) {
    lines.push('GROUP BY')
    gbParts.forEach((g, i) => lines.push(`    ${g}${i < gbParts.length - 1 ? ',' : ''}`))
  }
  if (havingParts.length) { lines.push('HAVING'); havingParts.forEach(h => lines.push(`    ${h}`)) }
  if (obParts.length) {
    lines.push('ORDER BY')
    obParts.forEach((o, i) => lines.push(`    ${o}${i < obParts.length - 1 ? ',' : ''}`))
  }
  const limitStr = limit && dialect.limitClause(limit)
  if (limitStr) lines.push(limitStr)

  return lines.join('\n')
}

function buildInsert(dialect, schema, qs) {
  const { dmlTable, insertVals } = qs
  if (!dmlTable) return '-- Seleziona una tabella per INSERT'
  const q = id => dialect.quoteId(id)
  const table = schema.tables[dmlTable]
  if (!table) return '-- Tabella non trovata'

  // Exclude identity/auto-increment columns — the DB generates these
  const cols = table.cols.filter(c =>
    !c.isIdentity &&
    insertVals[c.name] !== undefined &&
    insertVals[c.name] !== ''
  )
  if (!cols.length) return `INSERT INTO ${q(dmlTable)}\n    (-- colonne --)\nVALUES\n    (-- valori --)`

  const colList = cols.map(c => q(c.name)).join(', ')
  const valList = cols.map(c => fmtVal(dialect, c, insertVals[c.name])).join(', ')

  return `INSERT INTO ${q(dmlTable)}\n    (${colList})\nVALUES\n    (${valList})`
}

function buildUpdate(dialect, schema, qs) {
  const { dmlTable, updateSets, qConds } = qs
  if (!dmlTable) return '-- Seleziona una tabella per UPDATE'
  const q = id => dialect.quoteId(id)

  const validSets = updateSets.filter(s => s.col)
  if (!validSets.length) return `UPDATE ${q(dmlTable)}\nSET\n    -- aggiungi colonne da aggiornare`

  const setParts = validSets.map(s => {
    const v = (s.val || '').trim()
    const fv = v !== '' ? renderVal(dialect, v) : 'NULL'
    return `${q(s.col)} = ${fv}`
  })

  const lines = [`UPDATE ${q(dmlTable)}`, `SET`]
  setParts.forEach((p, i) => lines.push(`    ${p}${i < setParts.length - 1 ? ',' : ''}`))
  const whereParts = buildDmlWhereParts(dialect, qConds)
  if (whereParts.length) {
    lines.push('WHERE')
    whereParts.forEach(w => lines.push(`    ${w}`))
  } else {
    lines.push('-- ⚠ Nessuna WHERE: aggiornerà TUTTE le righe!')
  }
  return lines.join('\n')
}

function buildDelete(dialect, schema, qs) {
  const { dmlTable, qConds } = qs
  if (!dmlTable) return '-- Seleziona una tabella per DELETE'
  const q = id => dialect.quoteId(id)

  const lines = [`DELETE FROM ${q(dmlTable)}`]
  const whereParts = buildDmlWhereParts(dialect, qConds)
  if (whereParts.length) {
    lines.push('WHERE')
    whereParts.forEach(w => lines.push(`    ${w}`))
  } else {
    lines.push('-- ⚠ Nessuna WHERE: eliminerà TUTTE le righe!')
  }
  return lines.join('\n')
}

function buildMultiInsert(dialect, schema, qs) {
  const { dmlSelectedTables, insertValsByTable } = qs
  if (!dmlSelectedTables.length) return '-- Seleziona almeno una tabella per INSERT multi-tabella'
  const sorted = topoSort(dmlSelectedTables, schema.relationships)
  const q = id => dialect.quoteId(id)
  const blocks = []

  sorted.forEach(tName => {
    const table = schema.tables[tName]
    if (!table) return
    const vals = insertValsByTable[tName] || {}
    const cols = table.cols.filter(c =>
      !c.isIdentity && vals[c.name] !== undefined && vals[c.name] !== ''
    )
    let stmt
    if (!cols.length) {
      stmt = `INSERT INTO ${q(tName)}\n    (-- colonne --)\nVALUES\n    (-- valori --)`
    } else {
      const colList = cols.map(c => q(c.name)).join(', ')
      const valList = cols.map(c => fmtVal(dialect, c, vals[c.name])).join(', ')
      stmt = `INSERT INTO ${q(tName)}\n    (${colList})\nVALUES\n    (${valList})`
    }
    blocks.push(`-- ${tName}\n${stmt}`)
  })

  return blocks.join('\n\n')
}

function buildMultiDelete(dialect, schema, qs) {
  const { dmlSelectedTables } = qs
  if (!dmlSelectedTables.length) return '-- Seleziona almeno una tabella per DELETE multi-tabella'
  const sorted = topoSort(dmlSelectedTables, schema.relationships)
  const reversed = [...sorted].reverse()
  const q = id => dialect.quoteId(id)

  const blocks = reversed.map(t =>
    `-- ${t}\nDELETE FROM ${q(t)}\n-- ⚠ Aggiungere clausola WHERE per evitare di eliminare tutte le righe`
  )
  return blocks.join('\n\n')
}

function buildMongoMultiInsert(schema, qs) {
  const { dmlSelectedTables, insertValsByTable } = qs
  if (!dmlSelectedTables.length) return '// Seleziona almeno una collection per INSERT multi-tabella'
  const sorted = topoSort(dmlSelectedTables, schema.relationships)
  const blocks = sorted.map(tName => {
    const vals = insertValsByTable[tName] || {}
    const fields = Object.entries(vals)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `  "${k}": ${isNaN(v) || v === '' ? `"${v}"` : v}`)
    if (!fields.length) return `// ${tName}\ndb.${tName}.insertOne({\n  // aggiungi campi\n})`
    return `// ${tName}\ndb.${tName}.insertOne({\n${fields.join(',\n')}\n})`
  })
  return blocks.join('\n\n')
}

function buildMongoMultiDelete(schema, qs) {
  const { dmlSelectedTables } = qs
  if (!dmlSelectedTables.length) return '// Seleziona almeno una collection per DELETE multi-tabella'
  const sorted = topoSort(dmlSelectedTables, schema.relationships)
  const reversed = [...sorted].reverse()
  const blocks = reversed.map(t =>
    `// ${t}\ndb.${t}.deleteMany({}) // ⚠ elimina tutto!`
  )
  return blocks.join('\n\n')
}

function buildMongoDML(qs) {
  const { queryType, dmlTable, insertVals, updateSets, qConds } = qs
  if (!dmlTable) return `// Seleziona una collection per ${queryType}`

  if (queryType === 'INSERT') {
    const fields = Object.entries(insertVals)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `  "${k}": ${isNaN(v) || v === '' ? `"${v}"` : v}`)
    if (!fields.length) return `db.${dmlTable}.insertOne({\n  // aggiungi campi\n})`
    return `db.${dmlTable}.insertOne({\n${fields.join(',\n')}\n})`
  }

  if (queryType === 'UPDATE') {
    const setConds = qConds.filter(c => c.col && c.op)
    const matchParts = setConds.map(c => {
      const v = isNaN(c.val) && c.val ? `"${c.val}"` : (c.val || 0)
      return `  "${c.col}": ${v}`
    })
    const setParts = updateSets.filter(s => s.col).map(s => {
      const v = isNaN(s.val) && s.val ? `"${s.val}"` : (s.val || 'null')
      return `    "${s.col}": ${v}`
    })
    return `db.${dmlTable}.updateMany(\n  { ${matchParts.join(', ')} },\n  { $set: {\n${setParts.join(',\n') || '    // aggiungi campi'}\n  } }\n)`
  }

  if (queryType === 'DELETE') {
    const matchParts = qConds.filter(c => c.col && c.op).map(c => {
      const v = isNaN(c.val) && c.val ? `"${c.val}"` : (c.val || 0)
      return `  "${c.col}": ${v}`
    })
    if (!matchParts.length) return `db.${dmlTable}.deleteMany({}) // ⚠ elimina tutto!`
    return `db.${dmlTable}.deleteMany({\n${matchParts.join(',\n')}\n})`
  }

  return '// tipo DML non riconosciuto'
}

// ── MongoDB pipeline from manual stages (step 7) ──────────────────────────────

function renderMongoValue(v) {
  const s = (v || '').trim()
  if (!s) return null
  if (s.startsWith('$')) return s     // field reference or expression
  if (!isNaN(s)) return Number(s)
  if (s === 'true') return true
  if (s === 'false') return false
  return `"${s}"`
}

function buildPipelineFromStages(dialect, schema, qs) {
  const { qPipelineStages, qTables } = qs
  const main = [...qTables][0] || 'collection'
  const lines = [`db.${main}.aggregate([`]

  qPipelineStages.forEach(stage => {
    const cfg = stage.config || {}

    switch (stage.type) {
      case '$match': {
        const conds = (cfg.conditions || []).filter(c => (c.field || c.customField) && c.val !== '')
        if (!conds.length) { lines.push(`  { $match: {} },`); break }
        const parts = conds.map(c => {
          const field = c.field === '__custom__' ? (c.customField || '') : c.field
          const v = renderMongoValue(c.val)
          if (c.op === '$eq')    return `"${field}": ${v}`
          if (c.op === '$regex') return `"${field}": { $regex: "${c.val}", $options: "i" }`
          if (c.op === '$in') {
            const arr = (c.val || '').split(',').map(x => x.trim())
              .map(x => isNaN(x) ? `"${x}"` : Number(x))
            return `"${field}": { $in: [${arr.join(', ')}] }`
          }
          return `"${field}": { ${c.op}: ${v} }`
        })
        lines.push(`  { $match: { ${parts.join(', ')} } },`)
        break
      }

      case '$group': {
        const idFields = cfg.idFields || []
        const accs = cfg.accumulators || []
        const idParts = idFields.length
          ? `{ ${idFields.map(f => `"${f.field}": "$${f.field}"`).join(', ')} }`
          : 'null'
        const accParts = accs.map(a => {
          const val = a.field === '*' ? 1 : `"$${a.field}"`
          return `"${a.alias || 'total'}": { ${a.op}: ${val} }`
        })
        lines.push(`  {`)
        lines.push(`    $group: {`)
        lines.push(`      _id: ${idParts},`)
        accParts.forEach(p => lines.push(`      ${p},`))
        lines.push(`    }`)
        lines.push(`  },`)
        break
      }

      case '$project': {
        const fields = cfg.fields || {}
        const parts = Object.entries(fields).map(([k, v]) => `"${k}": ${v}`)
        if (!parts.length) { lines.push(`  { $project: { _id: 0 } },`); break }
        lines.push(`  { $project: { _id: 0, ${parts.join(', ')} } },`)
        break
      }

      case '$sort': {
        const sortFields = cfg.fields || []
        if (!sortFields.length) { lines.push(`  { $sort: {} },`); break }
        const parts = sortFields.map(s => `"${s.field}": ${s.dir === 'DESC' ? -1 : 1}`)
        lines.push(`  { $sort: { ${parts.join(', ')} } },`)
        break
      }

      case '$limit':
        lines.push(`  { $limit: ${cfg.n || 10} },`)
        break

      case '$skip':
        lines.push(`  { $skip: ${cfg.n || 0} },`)
        break

      case '$lookup':
        lines.push(`  {`)
        lines.push(`    $lookup: {`)
        lines.push(`      from: "${cfg.from || ''}",`)
        lines.push(`      localField: "${cfg.localField || ''}",`)
        lines.push(`      foreignField: "${cfg.foreignField || ''}",`)
        lines.push(`      as: "${cfg.as || cfg.from || 'joined'}"`)
        lines.push(`    }`)
        lines.push(`  },`)
        break

      case '$unwind':
        lines.push(`  { $unwind: { path: "${cfg.path || ''}", preserveNullAndEmptyArrays: true } },`)
        break

      case '$addFields': {
        const flds = cfg.fields || []
        if (!flds.length) { lines.push(`  { $addFields: {} },`); break }
        const parts = flds.filter(f => f.name).map(f => `"${f.name}": ${f.expr?.startsWith('$') ? f.expr : `"${f.expr}"`}`)
        lines.push(`  { $addFields: { ${parts.join(', ')} } },`)
        break
      }

      default:
        lines.push(`  { ${stage.type}: {} },`)
    }
  })

  lines.push(`])`)
  return lines.join('\n')
}

export function useGeneratedCode() {
  const schema = useSchemaStore()
  const qs = useQueryStore()
  const { dialectId } = useUIStore()
  const dialect = DIALECTS[dialectId]

  return useMemo(() => {
    const { queryType, dmlMulti, wrapTransaction, qPipelineStages } = qs

    // ── DDL generator ──────────────────────────────────────────────────────
    if (queryType === 'DDL') {
      return buildDDL(dialect, schema)
    }

    // ── Schema migration ───────────────────────────────────────────────────
    if (queryType === 'MIGRATION') {
      return buildMigration(dialect, schema.baseSchema || { tables: {}, relationships: [] }, schema)
    }

    // ── MongoDB visual pipeline ────────────────────────────────────────────
    if (dialectId === 'mongodb' && queryType === 'SELECT' && qPipelineStages.length > 0) {
      return buildPipelineFromStages(dialect, schema, qs)
    }

    let code
    if (queryType !== 'SELECT') {
      if (dmlMulti) {
        if (dialectId === 'mongodb') {
          if (queryType === 'INSERT') code = buildMongoMultiInsert(schema, qs)
          else if (queryType === 'DELETE') code = buildMongoMultiDelete(schema, qs)
        } else {
          if (queryType === 'INSERT') code = buildMultiInsert(dialect, schema, qs)
          else if (queryType === 'DELETE') code = buildMultiDelete(dialect, schema, qs)
        }
      }
      if (!code) {
        if (dialectId === 'mongodb') code = buildMongoDML(qs)
        else if (queryType === 'INSERT') code = buildInsert(dialect, schema, qs)
        else if (queryType === 'UPDATE') code = buildUpdate(dialect, schema, qs)
        else if (queryType === 'DELETE') code = buildDelete(dialect, schema, qs)
      }
    } else {
      code = dialect.supportsSQL
        ? buildSQL(dialect, schema, qs)
        : dialect.generatePipeline(schema, qs)
    }

    code = code || ''

    // ── Transaction wrapper (step 4) ───────────────────────────────────────
    if (wrapTransaction && queryType !== 'SELECT' && code) {
      const begin    = dialect.beginTx    || 'BEGIN'
      const commit   = dialect.commitTx   || 'COMMIT'
      const rollback = dialect.rollbackTx || 'ROLLBACK'
      code = `${begin}\n\n${code}\n\n${commit}\n-- On error: ${rollback}`
    }

    return code
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialectId, schema.tables, schema.relationships, schema.baseSchema,
      qs.queryType, qs.qTables, qs.qCols, qs.qConds, qs.qGroupBy, qs.qAggs, qs.jTypes,
      qs.distinct, qs.limit, qs.orderBy, qs.colAliases, qs.qHaving, qs.tableAliases,
      qs.dmlTable, qs.insertVals, qs.updateSets,
      qs.dmlMulti, qs.dmlSelectedTables, qs.insertValsByTable,
      qs.wrapTransaction, qs.qPipelineStages])
}
