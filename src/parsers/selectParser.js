/**
 * selectParser.js
 * Parses a SQL SELECT statement and returns a descriptor that can be fed into
 * useQueryStore.loadFromParsed().
 *
 * Supports:
 *   SELECT [DISTINCT] [TOP n] <cols> FROM <table> [[AS] alias]
 *          [JOIN/LEFT JOIN/INNER JOIN/RIGHT JOIN <table> [[AS] alias] ON ...]
 *          [WHERE ...]
 *          [GROUP BY ...]
 *          [ORDER BY ...]
 *          [LIMIT n]
 *
 * Column references may be table.col, quoted ([x], "x", `x`), or bare names.
 * Aggregate functions in SELECT (COUNT, SUM, AVG, MIN, MAX) are added to qAggs.
 * @param values matching /@\w+/ are collected as qParams.
 *
 * Returns null on parse failure.
 */

// Unquote [name], "name", `name`, or plain name
function unquote(s) {
  if (!s) return s
  s = s.trim()
  if ((s.startsWith('[') && s.endsWith(']')) ||
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith('`') && s.endsWith('`'))) {
    return s.slice(1, -1)
  }
  return s
}

// Remove leading/trailing whitespace + outer parens if present
function stripParens(s) {
  s = s.trim()
  if (s.startsWith('(') && s.endsWith(')')) return s.slice(1, -1).trim()
  return s
}

// Split comma-separated items respecting parentheses
function splitComma(s) {
  const parts = []
  let depth = 0, start = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth--
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(s.slice(start).trim())
  return parts.filter(Boolean)
}

const QUOTE_RE = /(\[[^\]]+\]|"[^"]+"|`[^`]+`)/g
const IDENT_RE = /^[\[\]"`]?[\w\s]+[\[\]"`]?$/

// Detect @param markers
function extractParams(text) {
  const params = []
  const seen = new Set()
  const re = /@(\w+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); params.push({ name: m[1], type: 'string', example: '' }) }
  }
  return params
}

const AGG_FUNCS_RE = /^(COUNT|SUM|AVG|MIN|MAX)\s*\((.+)\)$/i

export function parseSelectSQL(sql) {
  try {
    return _parse(sql)
  } catch (e) {
    console.warn('selectParser error:', e)
    return null
  }
}

function _parse(sql) {
  // Normalise line endings and consecutive spaces
  let s = sql.replace(/\r\n/g, '\n').replace(/\t/g, ' ')

  // Remove single-line comments
  s = s.replace(/--[^\n]*/g, ' ')

  // Normalise spaces (but preserve newlines for clause detection)
  s = s.replace(/[ ]+/g, ' ').trim()

  // Uppercase keywords for matching
  const up = s.toUpperCase()

  // ── Locate clause positions ─────────────────────────────────────────────
  function kPos(kw) {
    const re = new RegExp(`\\b${kw}\\b`, 'i')
    const m = up.match(re)
    return m ? m.index : -1
  }

  // More robust: find clauses from the end so ORDER BY doesn't eat GROUP BY
  const posSelect   = kPos('SELECT')
  const posFrom     = findClause(up, 'FROM')
  const posWhere    = findClause(up, 'WHERE')
  const posGroupBy  = findClause(up, 'GROUP BY')
  const posHaving   = findClause(up, 'HAVING')
  const posOrderBy  = findClause(up, 'ORDER BY')
  const posLimit    = findClause(up, 'LIMIT')

  if (posSelect < 0 || posFrom < 0) return null

  // ── SELECT clause ────────────────────────────────────────────────────────
  const selectClause = s.slice(posSelect + 6, posFrom).trim()

  let distinct = false
  let limit = ''
  let selectBody = selectClause

  if (/^DISTINCT\b/i.test(selectBody)) {
    distinct = true
    selectBody = selectBody.replace(/^DISTINCT\s+/i, '')
  }

  const topMatch = selectBody.match(/^TOP\s+(\d+)\s+/i)
  if (topMatch) {
    limit = topMatch[1]
    selectBody = selectBody.slice(topMatch[0].length)
  }

  // ── FROM + JOINs ─────────────────────────────────────────────────────────
  const endOfFrom = firstDefined([posWhere, posGroupBy, posOrderBy, posLimit, s.length])
  const fromBlock = s.slice(posFrom + 4, endOfFrom).trim()

  const { mainTable, mainAlias, joinDefs } = parseFromBlock(fromBlock)
  if (!mainTable) return null

  const tables = [mainTable]
  const tableAliases = {}
  if (mainAlias) tableAliases[mainTable] = mainAlias

  const jTypes = {}
  joinDefs.forEach(j => {
    if (!tables.includes(j.table)) tables.push(j.table)
    if (j.alias) tableAliases[j.table] = j.alias
    const k = `${j.fromTable}>${j.table}`
    jTypes[k] = j.type || 'INNER'
  })

  // ── Parse SELECT columns ─────────────────────────────────────────────────
  const colItems = splitComma(selectBody)
  const cols = {}
  const qAggs = []
  const colAliases = {}

  tables.forEach(t => { cols[t] = [] })

  colItems.forEach(item => {
    if (item === '*' || item === '') return

    // Detect AS alias
    let alias = ''
    const asMatch = item.match(/\bAS\s+(.+)$/i)
    if (asMatch) {
      alias = unquote(asMatch[1].trim())
      item = item.slice(0, asMatch.index).trim()
    }

    // Aggregate function?
    const aggM = item.trim().match(AGG_FUNCS_RE)
    if (aggM) {
      const func  = aggM[1].toUpperCase()
      const inner = aggM[2].trim()
      if (inner === '*') {
        qAggs.push({ func, col: '*', alias: alias || 'totale' })
      } else {
        const [t, c] = parseColRef(inner, mainTable, tableAliases)
        qAggs.push({ func, col: `${t}.${c}`, alias: alias || func.toLowerCase() })
      }
      return
    }

    // Plain column reference
    const [t, c] = parseColRef(item.trim(), mainTable, tableAliases)
    if (!cols[t]) cols[t] = []
    if (!cols[t].includes(c)) cols[t].push(c)
    if (alias) colAliases[`${t}.${c}`] = alias
  })

  // ── WHERE clause ─────────────────────────────────────────────────────────
  const qConds = []
  if (posWhere >= 0) {
    const endW = firstDefined([posGroupBy, posOrderBy, posLimit, s.length])
    const whereClause = s.slice(posWhere + 5, endW).trim()
    parseWhere(whereClause, mainTable, tableAliases, qConds)
  }

  // ── GROUP BY ─────────────────────────────────────────────────────────────
  const qGroupBy = []
  if (posGroupBy >= 0) {
    const endG = firstDefined([posHaving, posOrderBy, posLimit, s.length])
    const gbClause = s.slice(posGroupBy + 8, endG).trim()
    splitComma(gbClause).forEach(item => {
      const [t, c] = parseColRef(item.trim(), mainTable, tableAliases)
      qGroupBy.push({ table: t, col: c })
    })
  }

  // ── ORDER BY ─────────────────────────────────────────────────────────────
  const orderBy = []
  if (posOrderBy >= 0) {
    const endO = firstDefined([posLimit, s.length])
    const obClause = s.slice(posOrderBy + 8, endO).trim()
    splitComma(obClause).forEach(item => {
      const dir = /\bDESC\b/i.test(item) ? 'DESC' : 'ASC'
      const colPart = item.replace(/\b(ASC|DESC)\b/i, '').trim()
      const [t, c] = parseColRef(colPart, mainTable, tableAliases)
      orderBy.push({ table: t, col: c, dir })
    })
  }

  // ── LIMIT ────────────────────────────────────────────────────────────────
  if (posLimit >= 0) {
    const limitStr = s.slice(posLimit + 5).trim().match(/^\d+/)?.[0] || ''
    if (limitStr) limit = limitStr
  }

  // ── Params ───────────────────────────────────────────────────────────────
  const qParams = extractParams(sql)

  // Build cols as Sets
  const colSets = {}
  tables.forEach(t => { colSets[t] = new Set(cols[t] || []) })

  return {
    tables,
    cols: colSets,
    jTypes,
    qConds,
    qGroupBy,
    qAggs,
    distinct,
    limit,
    orderBy,
    colAliases,
    qHaving: [],
    tableAliases,
    qParams,
  }
}

// Find a top-level keyword position (not inside parentheses / quotes)
function findClause(up, kw) {
  const re = new RegExp(`\\b${kw.replace(' ', '\\s+')}\\b`)
  const m = up.match(re)
  return m ? m.index : -1
}

function firstDefined(arr) {
  for (const v of arr) if (v >= 0 && v !== undefined) return v
  return -1
}

function parseColRef(ref, defaultTable, tableAliases) {
  ref = ref.trim()
  const dotIdx = ref.lastIndexOf('.')
  if (dotIdx >= 0) {
    const tRaw = unquote(ref.slice(0, dotIdx))
    const col  = unquote(ref.slice(dotIdx + 1))
    // Resolve alias → real table name
    const realTable = Object.entries(tableAliases).find(([, a]) => a === tRaw)?.[0] || tRaw
    return [realTable, col]
  }
  return [defaultTable, unquote(ref)]
}

function parseFromBlock(fromBlock) {
  // Split on JOIN keywords keeping them as delimiters
  const joinRe = /\b(INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|JOIN)\b/gi
  const parts = fromBlock.split(joinRe)

  const mainPart = parts[0].trim()
  const mainInfo = parseTableRef(mainPart)
  const mainTable = mainInfo.table
  const mainAlias = mainInfo.alias

  const joinDefs = []
  for (let i = 1; i < parts.length; i += 2) {
    const joinType = parts[i]?.replace(/\s+/g, ' ').trim().toUpperCase()
    const rest = (parts[i + 1] || '').trim()
    // Split on ON
    const onIdx = rest.search(/\bON\b/i)
    const tableRef = onIdx >= 0 ? rest.slice(0, onIdx).trim() : rest
    const info = parseTableRef(tableRef)
    const jt = joinType.startsWith('LEFT') ? 'LEFT'
      : joinType.startsWith('RIGHT') ? 'RIGHT'
      : joinType.startsWith('FULL')  ? 'FULL OUTER'
      : joinType.startsWith('CROSS') ? 'CROSS'
      : 'INNER'

    // Determine fromTable from ON clause (best-effort)
    joinDefs.push({ table: info.table, alias: info.alias, type: jt, fromTable: mainTable })
  }

  return { mainTable, mainAlias, joinDefs }
}

function parseTableRef(s) {
  s = s.trim()
  // table [AS] alias
  const m = s.match(/^(.+?)\s+(?:AS\s+)?(\w+)$/i)
  if (m && !/^AS$/i.test(m[2])) {
    return { table: unquote(m[1].trim()), alias: unquote(m[2]) }
  }
  return { table: unquote(s), alias: '' }
}

const SIMPLE_OPS = ['<>', '>=', '<=', '>', '<', '=']
const SQL_OPS_RE = /(<>|>=|<=|>|<|=|\bLIKE\b|\bNOT\s+LIKE\b|\bIN\b|\bIS\s+NULL\b|\bIS\s+NOT\s+NULL\b)/i

function parseWhere(whereClause, defaultTable, tableAliases, out) {
  // Split on top-level AND/OR
  const tokens = splitWhereTokens(whereClause)

  tokens.forEach(({ conn, expr }) => {
    const cond = parseCondition(expr.trim(), defaultTable, tableAliases)
    if (cond) out.push({ conn, ...cond })
  })
}

function splitWhereTokens(s) {
  const tokens = []
  // Simple split on AND / OR at top level
  const re = /\b(AND|OR)\b/gi
  let last = 0
  let conn = 'AND'
  let m

  const cleanS = s.replace(/\(|\)/g, ' ') // strip parens for simplicity

  const segments = []
  let prev = 0
  const andOr = /\b(AND|OR)\b/gi
  while ((m = andOr.exec(cleanS)) !== null) {
    segments.push({ conn: conn, text: cleanS.slice(prev, m.index).trim() })
    conn = m[1].toUpperCase()
    prev = m.index + m[0].length
  }
  segments.push({ conn, text: cleanS.slice(prev).trim() })

  return segments.filter(s => s.text)
}

function parseCondition(expr, defaultTable, tableAliases) {
  // IS NULL / IS NOT NULL
  const isNullM = expr.match(/^(.+?)\s+(IS\s+NOT\s+NULL|IS\s+NULL)\s*$/i)
  if (isNullM) {
    const [t, c] = parseColRef(isNullM[1].trim(), defaultTable, tableAliases)
    return { table: t, col: c, op: isNullM[2].replace(/\s+/g, ' ').toUpperCase(), val: '' }
  }

  // Standard comparison
  const opM = expr.match(/^(.+?)\s*(<>|>=|<=|>|<|=)\s*(.+)$/)
  if (opM) {
    const [t, c] = parseColRef(opM[1].trim(), defaultTable, tableAliases)
    const val = stripQuotes(opM[3].trim())
    return { table: t, col: c, op: opM[2], val }
  }

  // LIKE
  const likeM = expr.match(/^(.+?)\s+(?:NOT\s+)?LIKE\s+(.+)$/i)
  if (likeM) {
    const [t, c] = parseColRef(likeM[1].trim(), defaultTable, tableAliases)
    const val = stripQuotes(likeM[2].trim()).replace(/^%|%$/g, '')
    return { table: t, col: c, op: 'LIKE', val }
  }

  // IN (...)
  const inM = expr.match(/^(.+?)\s+IN\s*\((.+)\)$/i)
  if (inM) {
    const [t, c] = parseColRef(inM[1].trim(), defaultTable, tableAliases)
    const val = inM[2].split(',').map(v => stripQuotes(v.trim())).join(', ')
    return { table: t, col: c, op: 'IN', val }
  }

  return null
}

function stripQuotes(s) {
  s = s.trim()
  if ((s.startsWith("'") && s.endsWith("'")) ||
      (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1)
  }
  return s
}
