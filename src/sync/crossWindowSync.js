import { useSchemaStore } from '../store/useSchemaStore.js'
import { useQueryStore } from '../store/useQueryStore.js'
import { useUIStore } from '../store/useUIStore.js'

const CH_NAME = 'qb_sync_v1'

function serialize() {
  const s = useSchemaStore.getState()
  const q = useQueryStore.getState()
  const u = useUIStore.getState()
  return {
    tables: s.tables,
    relationships: s.relationships,
    queryType: q.queryType,
    qTables: [...q.qTables],
    qCols: Object.fromEntries(Object.entries(q.qCols).map(([k, v]) => [k, [...v]])),
    qConds: q.qConds,
    qGroupBy: q.qGroupBy,
    qAggs: q.qAggs,
    jTypes: q.jTypes,
    distinct: q.distinct,
    limit: q.limit,
    orderBy: q.orderBy,
    colAliases: q.colAliases,
    qHaving: q.qHaving,
    tableAliases: q.tableAliases,
    dmlTable: q.dmlTable,
    insertVals: q.insertVals,
    updateSets: q.updateSets,
    dmlMulti: q.dmlMulti,
    dmlSelectedTables: q.dmlSelectedTables,
    insertValsByTable: q.insertValsByTable,
    dialectId: u.dialectId,
  }
}

function applyState(data) {
  useSchemaStore.setState({
    tables: data.tables || {},
    relationships: data.relationships || [],
  })
  useQueryStore.setState({
    queryType: data.queryType || 'SELECT',
    qTables: new Set(data.qTables || []),
    qCols: Object.fromEntries(Object.entries(data.qCols || {}).map(([k, v]) => [k, new Set(v)])),
    qConds: data.qConds || [],
    qGroupBy: data.qGroupBy || [],
    qAggs: data.qAggs || [],
    jTypes: data.jTypes || {},
    distinct: data.distinct || false,
    limit: data.limit || '',
    orderBy: data.orderBy || [],
    colAliases: data.colAliases || {},
    qHaving: data.qHaving || [],
    tableAliases: data.tableAliases || {},
    dmlTable: data.dmlTable || '',
    insertVals: data.insertVals || {},
    updateSets: data.updateSets || [],
    dmlMulti: data.dmlMulti || false,
    dmlSelectedTables: data.dmlSelectedTables || [],
    insertValsByTable: data.insertValsByTable || {},
  })
  useUIStore.setState({ dialectId: data.dialectId || 'sqlserver' })
}

// ── Main window ──────────────────────────────────────────────────────────────
// Call once in App; returned cleanup closes the channel.
export function startBroadcasting() {
  let ch
  try { ch = new BroadcastChannel(CH_NAME) } catch { return () => {} }

  const broadcast = () => {
    try { ch.postMessage({ type: 'STATE', payload: serialize() }) } catch {}
  }

  // Popout asks for initial state when it opens
  ch.onmessage = ({ data }) => {
    if (data.type === 'REQUEST_STATE') broadcast()
  }

  const unsub1 = useSchemaStore.subscribe(broadcast)
  const unsub2 = useQueryStore.subscribe(broadcast)
  const unsub3 = useUIStore.subscribe(broadcast)

  return () => { unsub1(); unsub2(); unsub3(); try { ch.close() } catch {} }
}

// ── Popout window ─────────────────────────────────────────────────────────────
// Returns cleanup. Sets initial state to "waiting" then receives live updates.
export function startReceiving() {
  let ch
  try { ch = new BroadcastChannel(CH_NAME) } catch { return () => {} }

  ch.onmessage = ({ data }) => {
    if (data.type === 'STATE') applyState(data.payload)
  }

  // Ask main window for current state
  try { ch.postMessage({ type: 'REQUEST_STATE' }) } catch {}

  return () => { try { ch.close() } catch {} }
}
