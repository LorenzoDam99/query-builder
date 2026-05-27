import { create } from 'zustand'

const empty = () => ({
  queryType: 'SELECT',  // 'SELECT'|'INSERT'|'UPDATE'|'DELETE'|'DDL'|'MIGRATION'
  qTables: new Set(),
  qCols: {},      // tableName -> Set<colName>
  qConds: [],     // [{conn, table, col, op, val, subquery?}]
  qGroupBy: [],   // [{table, col}]
  qAggs: [],      // [{func, col, alias, raw?}]
  jTypes: {},     // 'A>B' -> 'INNER'|'LEFT'|'RIGHT'|'FULL OUTER'
  distinct: false,
  limit: '',      // numeric string, '' = no limit
  orderBy: [],    // [{table, col, dir: 'ASC'|'DESC'}]
  colAliases: {}, // 'table.col' -> alias string
  qHaving: [],    // [{conn, aggFunc, aggCol, op, val}]
  tableAliases: {}, // tableName -> alias string
  // DML
  dmlTable: '',         // target table for INSERT/UPDATE/DELETE (single-table mode)
  insertVals: {},       // { colName: value }
  updateSets: [],       // [{ col, val }]
  dmlMulti: false,                // FK-aware multi-table mode
  dmlSelectedTables: [],          // table names selected for multi-DML
  insertValsByTable: {},          // { tableName: { colName: value } }
  // Query parameters (step 3)
  qParams: [],     // [{name, type, example}]
  // Transaction wrapper (step 4)
  wrapTransaction: false,
  // MongoDB pipeline stages (step 7)
  qPipelineStages: [], // [{id, type, config}]
})

export const useQueryStore = create((set, get) => ({
  ...empty(),

  reset() { set(empty()) },

  // Clears all query params but keeps tables in the ERD (qTables unchanged).
  // All column checkboxes are unchecked; conditions, joins and aliases are wiped.
  resetQuery() {
    const { qTables } = get()
    // Empty Set per table → all checkboxes unchecked
    const qCols = {}
    qTables.forEach(t => { qCols[t] = new Set() })
    set({
      queryType: 'SELECT',
      qCols,
      jTypes: {},
      qConds: [],
      qGroupBy: [],
      qAggs: [],
      distinct: false,
      limit: '',
      orderBy: [],
      colAliases: {},
      qHaving: [],
      tableAliases: {},
      dmlTable: '',
      insertVals: {},
      updateSets: [],
      dmlMulti: false,
      dmlSelectedTables: [],
      insertValsByTable: {},
      qParams: [],
      wrapTransaction: false,
      qPipelineStages: [],
    })
  },

  setQueryType(type) {
    // Reset multi-DML state when switching away from INSERT/DELETE
    const patch = { queryType: type }
    if (type !== 'INSERT' && type !== 'DELETE') {
      patch.dmlMulti = false
      patch.dmlSelectedTables = []
      patch.insertValsByTable = {}
    }
    set(patch)
  },

  setDmlTable(name) {
    set({ dmlTable: name, insertVals: {}, updateSets: [], qConds: [] })
  },

  setInsertVal(col, val) {
    set({ insertVals: { ...get().insertVals, [col]: val } })
  },

  setDmlMulti(val) {
    set({ dmlMulti: val, dmlSelectedTables: [], insertValsByTable: {} })
  },

  toggleDmlTable(name) {
    const list = get().dmlSelectedTables
    if (list.includes(name)) {
      const next = list.filter(t => t !== name)
      const nextVals = { ...get().insertValsByTable }
      delete nextVals[name]
      set({ dmlSelectedTables: next, insertValsByTable: nextVals })
    } else {
      set({ dmlSelectedTables: [...list, name] })
    }
  },

  setInsertValForTable(table, col, val) {
    const prev = get().insertValsByTable[table] || {}
    set({ insertValsByTable: { ...get().insertValsByTable, [table]: { ...prev, [col]: val } } })
  },

  setTableAlias(table, alias) {
    const next = { ...get().tableAliases }
    if (alias) next[table] = alias
    else delete next[table]
    set({ tableAliases: next })
  },

  addUpdateSet() {
    set({ updateSets: [...get().updateSets, { col: '', val: '' }] })
  },

  updateUpdateSet(i, patch) {
    const next = [...get().updateSets]
    next[i] = { ...next[i], ...patch }
    set({ updateSets: next })
  },

  removeUpdateSet(i) {
    const next = [...get().updateSets]
    next.splice(i, 1)
    set({ updateSets: next })
  },

  toggleTable(name, schema) {
    const { qTables, qCols, qConds, qGroupBy, qAggs, jTypes, orderBy, colAliases, qHaving } = get()
    if (qTables.has(name)) {
      const next = new Set(qTables)
      next.delete(name)
      const nextCols = { ...qCols }
      delete nextCols[name]
      const nextJT = { ...jTypes }
      Object.keys(nextJT).forEach(k => { if (k.includes(name)) delete nextJT[k] })
      const nextAliases = { ...colAliases }
      Object.keys(nextAliases).forEach(k => { if (k.startsWith(name + '.')) delete nextAliases[k] })
      set({
        qTables: next,
        qCols: nextCols,
        qConds: qConds.filter(c => c.table !== name),
        qGroupBy: qGroupBy.filter(g => g.table !== name),
        qAggs: qAggs.filter(a => !a.col?.startsWith(name + '.')),
        jTypes: nextJT,
        orderBy: orderBy.filter(o => o.table !== name),
        colAliases: nextAliases,
        qHaving: qHaving.filter(h => !h.aggCol?.startsWith(name + '.')),
      })
    } else {
      const next = new Set(qTables)
      next.add(name)
      const cols = new Set()
      schema.tables[name]?.cols.forEach((c, i) => { if (c.isPK || i < 5) cols.add(c.name) })
      const nextCols = { ...qCols, [name]: cols }
      const nextJT = { ...jTypes }
      schema.relationships.forEach(r => {
        if (next.has(r.from.table) && next.has(r.to.table)) {
          const k = `${r.from.table}>${r.to.table}`
          if (!nextJT[k]) nextJT[k] = 'INNER'
        }
      })
      set({ qTables: next, qCols: nextCols, jTypes: nextJT })
    }
  },

  toggleCol(table, col, on) {
    const { qCols } = get()
    const s = new Set(qCols[table] || [])
    on ? s.add(col) : s.delete(col)
    set({ qCols: { ...qCols, [table]: s } })
  },

  setJoinType(key, type) {
    set({ jTypes: { ...get().jTypes, [key]: type } })
  },

  addCond() {
    set({ qConds: [...get().qConds, { conn: 'AND', table: '', col: '', op: '=', val: '' }] })
  },

  updateCond(i, patch) {
    const next = [...get().qConds]
    next[i] = { ...next[i], ...patch }
    set({ qConds: next })
  },

  removeCond(i) {
    const next = [...get().qConds]
    next.splice(i, 1)
    set({ qConds: next })
  },

  toggleGroupBy(table, col, on) {
    const { qGroupBy } = get()
    if (on) {
      set({ qGroupBy: [...qGroupBy, { table, col }] })
    } else {
      set({ qGroupBy: qGroupBy.filter(g => !(g.table === table && g.col === col)) })
    }
  },

  addAgg() {
    set({ qAggs: [...get().qAggs, { func: 'COUNT', col: '*', alias: 'totale' }] })
  },

  updateAgg(i, patch) {
    const next = [...get().qAggs]
    next[i] = { ...next[i], ...patch }
    set({ qAggs: next })
  },

  removeAgg(i) {
    const next = [...get().qAggs]
    next.splice(i, 1)
    set({ qAggs: next })
  },

  setDistinct(val) { set({ distinct: val }) },
  setLimit(val) { set({ limit: val }) },

  addOrderBy() {
    set({ orderBy: [...get().orderBy, { table: '', col: '', dir: 'ASC' }] })
  },

  updateOrderBy(i, patch) {
    const next = [...get().orderBy]
    next[i] = { ...next[i], ...patch }
    set({ orderBy: next })
  },

  removeOrderBy(i) {
    const next = [...get().orderBy]
    next.splice(i, 1)
    set({ orderBy: next })
  },

  setAlias(key, alias) {
    const next = { ...get().colAliases }
    if (alias) next[key] = alias
    else delete next[key]
    set({ colAliases: next })
  },

  addHaving() {
    set({ qHaving: [...get().qHaving, { conn: 'AND', aggFunc: 'COUNT', aggCol: '*', op: '>', val: '0' }] })
  },

  updateHaving(i, patch) {
    const next = [...get().qHaving]
    next[i] = { ...next[i], ...patch }
    set({ qHaving: next })
  },

  removeHaving(i) {
    const next = [...get().qHaving]
    next.splice(i, 1)
    set({ qHaving: next })
  },

  // ── Query parameters (step 3) ─────────────────────────────────────────────
  addParam() {
    set({ qParams: [...get().qParams, { name: '', type: 'string', example: '' }] })
  },
  updateParam(i, patch) {
    const next = [...get().qParams]
    next[i] = { ...next[i], ...patch }
    set({ qParams: next })
  },
  removeParam(i) {
    const next = [...get().qParams]
    next.splice(i, 1)
    set({ qParams: next })
  },

  // ── Transaction wrapper (step 4) ──────────────────────────────────────────
  setWrapTransaction(val) { set({ wrapTransaction: val }) },

  // ── MongoDB pipeline stages (step 7) ─────────────────────────────────────
  addStage(type) {
    const id = Date.now()
    const defaults = {
      '$match':   { conditions: [] },
      '$group':   { idFields: [], accumulators: [] },
      '$project': { fields: {} },
      '$sort':    { fields: [] },
      '$limit':   { n: 10 },
      '$skip':    { n: 0 },
      '$lookup':  { from: '', localField: '', foreignField: '', as: '' },
      '$unwind':  { path: '' },
    }
    const config = defaults[type] || {}
    set({ qPipelineStages: [...get().qPipelineStages, { id, type, config }] })
  },
  updateStageConfig(i, config) {
    const next = [...get().qPipelineStages]
    next[i] = { ...next[i], config: { ...next[i].config, ...config } }
    set({ qPipelineStages: next })
  },
  removeStage(i) {
    const next = [...get().qPipelineStages]
    next.splice(i, 1)
    set({ qPipelineStages: next })
  },
  moveStage(i, dir) {
    const next = [...get().qPipelineStages]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ qPipelineStages: next })
  },

  // ── Load from parsed SQL (step 8) ─────────────────────────────────────────
  loadFromParsed(parsed) {
    const qTables = new Set(parsed.tables || [])
    const qCols = {}
    qTables.forEach(t => { qCols[t] = new Set(parsed.cols?.[t] || []) })
    set({
      queryType:    'SELECT',
      qTables,
      qCols,
      jTypes:       parsed.jTypes       || {},
      qConds:       parsed.qConds       || [],
      qGroupBy:     parsed.qGroupBy     || [],
      qAggs:        parsed.qAggs        || [],
      distinct:     parsed.distinct     || false,
      limit:        parsed.limit        || '',
      orderBy:      parsed.orderBy      || [],
      colAliases:   parsed.colAliases   || {},
      qHaving:      parsed.qHaving      || [],
      tableAliases: parsed.tableAliases || {},
      qParams:      parsed.qParams      || [],
    })
  },
}))
