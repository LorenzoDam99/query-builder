function clean(s) { return s.replace(/[\[\]`"']/g, '').trim() }

function splitComma(s) {
  const parts = []; let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts
}

/**
 * Extract extra column metadata from a DDL column definition line.
 * Returns { isIdentity, isGuid, defaultVal }.
 */
function parseColExtras(line) {
  // Identity: SQL Server IDENTITY, MySQL AUTO_INCREMENT, PostgreSQL GENERATED … AS IDENTITY
  const isIdentity =
    /\bIDENTITY(\s*\(\s*\d+\s*,\s*\d+\s*\))?/i.test(line) ||
    /\bAUTO_INCREMENT\b/i.test(line) ||
    /\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(line)

  // GUID column type
  const isGuid = /\b(uniqueidentifier|uuid)\b/i.test(line)

  // DEFAULT function call, e.g. DEFAULT GETDATE() or DEFAULT (NEWID())
  const fnMatch = line.match(/\bDEFAULT\s+\(?\s*([A-Za-z_][\w.]*\s*\([^)]*\))\s*\)?/i)
  const defaultVal = fnMatch ? fnMatch[1].replace(/\s+/g, '') : null

  return { isIdentity, isGuid, defaultVal }
}

export function parseDDL(raw) {
  const tables = {}, rels = []
  let sql = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  sql = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  const ctRe = /CREATE\s+TABLE\s+(?:\[?[\w\s]+\]?\s*\.\s*)?\[?([\w\s]+?)\]?\s*\(([\s\S]*?)\)(?=\s*(?:ON\s+|\s*GO\s*|WITH\s+|\s*;|\s*$))/gi
  let m
  while ((m = ctRe.exec(sql)) !== null) {
    const tname = clean(m[1])
    if (!tname || /^\d/.test(tname)) continue
    const body = m[2]
    const cols = [], pkSet = new Set()
    for (const part of splitComma(body)) {
      const line = part.trim()
      if (!line) continue

      // ── Table-level PRIMARY KEY constraint ──────────────────────────────
      // Only matches when the chunk STARTS with PRIMARY KEY or CONSTRAINT … PRIMARY KEY
      // (not when PRIMARY KEY appears inline after a column name/type)
      if (/^\s*(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY/i.test(line)) {
        const pm = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i)
        if (pm) pm[1].split(',').forEach(c => pkSet.add(clean(c)))
        continue
      }

      // ── Table-level FOREIGN KEY constraint ──────────────────────────────
      if (/^\s*(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY/i.test(line)) {
        const fm = line.match(/FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s*REFERENCES\s+(?:[\w]+\s*\.\s*)?([\w]+)\s*\(\s*([^)]+)\s*\)/i)
        if (fm) rels.push({ from: { table: tname, col: clean(fm[1]) }, to: { table: clean(fm[2]), col: clean(fm[3]) } })
        continue
      }

      // ── Other table-level constraints (UNIQUE, CHECK, INDEX) ─────────────
      if (/^\s*(?:CONSTRAINT|UNIQUE|CHECK|INDEX)\s/i.test(line)) continue

      // ── Column definition ────────────────────────────────────────────────
      const cm = line.match(/^\[?([\w\s]+?)\]?\s+\[?([\w]+)\]?(?:\s*\([^)]*\))?/)
      if (cm) {
        const cn = clean(cm[1])
        if (!cn || ['CONSTRAINT','PRIMARY','FOREIGN','UNIQUE','CHECK','INDEX','WITH'].includes(cn.toUpperCase())) continue
        const rawType = cm[2].trim()

        // PostgreSQL SERIAL types: treat as int + identity
        const isSerial = /^(smallserial|serial|bigserial)$/i.test(rawType)
        const extras = parseColExtras(line)

        // Inline PRIMARY KEY (e.g. col_name type NOT NULL\n    primary key,)
        const hasPKInline = /\bPRIMARY\s+KEY\b/i.test(line)
        if (hasPKInline) pkSet.add(cn)

        cols.push({
          name: cn,
          type: isSerial ? 'int' : rawType,
          isPK: false,
          isFK: false,
          nullable: !/NOT\s+NULL/i.test(line) && !isSerial,
          refs: null,
          isIdentity: isSerial || extras.isIdentity,
          isGuid: extras.isGuid,
          defaultVal: extras.defaultVal,
        })

        // Inline REFERENCES (PostgreSQL: col type REFERENCES schema.table [(col)])
        // Handles both:
        //   col type REFERENCES table (col)
        //   col type REFERENCES schema.table    ← no explicit col, defaults to same name
        const refMatch = line.match(/\bREFERENCES\s+(?:[\w]+\s*\.\s*)?([\w]+)\s*(?:\(\s*([\w]+)\s*\))?/i)
        if (refMatch) {
          const toTable = clean(refMatch[1])
          const toCol   = refMatch[2] ? clean(refMatch[2]) : cn   // default: same col name
          rels.push({ from: { table: tname, col: cn }, to: { table: toTable, col: toCol } })
        }
      }
    }
    pkSet.forEach(pk => { const c = cols.find(x => x.name === pk); if (c) c.isPK = true })
    tables[tname] = { name: tname, cols }
  }

  // ── ALTER TABLE … ADD FOREIGN KEY (works for SQL Server / explicit style) ──
  const fkRe = /ALTER\s+TABLE\s+(?:\[?[\w\s]+\]?\s*\.\s*)?\[?([\w\s]+?)\]?\s+(?:WITH\s+\w+\s+)?ADD\s+(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(\s*\[?([\w\s]+?)\]?\s*\)\s*REFERENCES\s+(?:\[?[\w\s]+\]?\s*\.\s*)?\[?([\w\s]+?)\]?\s*\(\s*\[?([\w\s]+?)\]?\s*\)/gi
  while ((m = fkRe.exec(sql)) !== null) {
    const ft = clean(m[1]), fc = clean(m[2]), tt = clean(m[3]), tc = clean(m[4])
    if (!rels.find(r => r.from.table === ft && r.from.col === fc && r.to.table === tt))
      rels.push({ from: { table: ft, col: fc }, to: { table: tt, col: tc } })
  }

  rels.forEach(r => {
    if (tables[r.from.table]) {
      const c = tables[r.from.table].cols.find(x => x.name === r.from.col)
      if (c) { c.isFK = true; c.refs = { table: r.to.table, col: r.to.col } }
    }
  })

  if (!Object.keys(tables).length) throw new Error('Nessuna tabella trovata. Verifica il formato DDL.')
  return { tables, relationships: rels }
}
