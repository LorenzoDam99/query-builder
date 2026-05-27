/**
 * Parse a JSON schema export into { tables, relationships }.
 *
 * Supported JSON fields per row:
 *   TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, IS_PK,
 *   FK_TABLE, FK_COLUMN,
 *   IS_IDENTITY / AUTO_INCREMENT   → isIdentity
 *   COLUMN_DEFAULT                 → defaultVal (function calls only, e.g. "GETDATE()")
 */
export function parseSchemaJSON(raw) {
  let data
  try { data = JSON.parse(raw) } catch { throw new Error('JSON non valido') }
  if (!Array.isArray(data)) throw new Error('Il JSON deve essere un array')
  const tables = {}, rels = []
  for (const row of data) {
    const tn = row.TABLE_NAME
    if (!tn) continue
    if (!tables[tn]) tables[tn] = { name: tn, cols: [] }

    const type = row.DATA_TYPE || ''

    // Identity detection from common JSON export conventions
    const isIdentity =
      row.IS_IDENTITY === 'YES' || row.IS_IDENTITY === true || row.IS_IDENTITY === 1 ||
      row.AUTO_INCREMENT === 'YES' || row.AUTO_INCREMENT === true || row.AUTO_INCREMENT === 1 ||
      row.EXTRA === 'auto_increment'        // MySQL INFORMATION_SCHEMA.COLUMNS

    // GUID type
    const isGuid = /^(uniqueidentifier|uuid)$/i.test(type)

    // DEFAULT value — only keep if it looks like a function call (e.g. "GETDATE()")
    const rawDefault = row.COLUMN_DEFAULT || row.COLUMN_DEF || ''
    const fnMatch = String(rawDefault).match(/^[(\s]*([A-Za-z_][\w.]*\s*\(\))[)\s]*$/)
    const defaultVal = fnMatch ? fnMatch[1].replace(/\s+/g, '') : null

    tables[tn].cols.push({
      name: row.COLUMN_NAME,
      type,
      isPK: row.IS_PK === 'YES' || row.IS_PK === true || row.IS_PK === 1,
      isFK: !!row.FK_TABLE,
      nullable: row.IS_NULLABLE === 'YES' || row.IS_NULLABLE === true,
      refs: row.FK_TABLE ? { table: row.FK_TABLE, col: row.FK_COLUMN } : null,
      isIdentity,
      isGuid,
      defaultVal,
    })
    if (row.FK_TABLE && !rels.find(r => r.from.table === tn && r.from.col === row.COLUMN_NAME))
      rels.push({ from: { table: tn, col: row.COLUMN_NAME }, to: { table: row.FK_TABLE, col: row.FK_COLUMN } })
  }
  if (!Object.keys(tables).length) throw new Error('Nessuna tabella trovata nel JSON')
  return { tables, relationships: rels }
}
