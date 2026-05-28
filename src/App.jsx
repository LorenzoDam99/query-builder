import { useEffect } from 'react'
import { useUIStore } from './store/useUIStore.js'
import { useSchemaStore } from './store/useSchemaStore.js'
import { useQueryStore } from './store/useQueryStore.js'
import { Header } from './components/layout/Header.jsx'
import { ImportScreen } from './components/import/ImportScreen.jsx'
import { BuilderScreen } from './components/BuilderScreen.jsx'
import { SQLPanel } from './components/sql/SQLPanel.jsx'
import { Toast } from './components/ui/Toast.jsx'
import { startBroadcasting, startReceiving } from './sync/crossWindowSync.js'
import './styles/tokens.css'

// ── Detect popout mode ───────────────────────────────────────────────────────
const POPOUT_PANEL = new URLSearchParams(window.location.search).get('popout')

// ── Session persistence (main window only) ───────────────────────────────────
const SESSION_KEY = 'qb_session_v1'

function serializeSession() {
  const schema = useSchemaStore.getState()
  const qs = useQueryStore.getState()
  const ui = useUIStore.getState()
  return {
    tables: schema.tables,
    relationships: schema.relationships,
    queryType: qs.queryType,
    qTables: [...qs.qTables],
    qCols: Object.fromEntries(Object.entries(qs.qCols).map(([k, v]) => [k, [...v]])),
    qConds: qs.qConds,
    qGroupBy: qs.qGroupBy,
    qAggs: qs.qAggs,
    jTypes: qs.jTypes,
    distinct: qs.distinct,
    limit: qs.limit,
    orderBy: qs.orderBy,
    colAliases: qs.colAliases,
    qHaving: qs.qHaving,
    tableAliases: qs.tableAliases,
    dmlTable: qs.dmlTable,
    insertVals: qs.insertVals,
    updateSets: qs.updateSets,
    dmlMulti: qs.dmlMulti,
    dmlSelectedTables: qs.dmlSelectedTables,
    insertValsByTable: qs.insertValsByTable,
    qParams: qs.qParams,
    wrapTransaction: qs.wrapTransaction,
    qPipelineStages: qs.qPipelineStages,
    qCustomCols: qs.qCustomCols,
    qColsOrder: qs.qColsOrder,
    qCTEs: qs.qCTEs,
    qWindowFuncs: qs.qWindowFuncs,
    qSubqueries: qs.qSubqueries,
    qUnions: qs.qUnions,
    dialectId: ui.dialectId,
    theme: ui.theme,
    tablePos: ui.tablePos,
    sidebarWidth: ui.sidebarWidth,
    sqlPanelWidth: ui.sqlPanelWidth,
    configHeight: ui.configHeight,
    sqlDock: ui.sqlDock,
    floatPos: ui.floatPos,
    erdHidden: [...ui.erdHidden],
  }
}

function restoreSession(data) {
  if (!data) return
  try {
    useSchemaStore.setState({ tables: data.tables || {}, relationships: data.relationships || [] })
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
      qParams: data.qParams || [],
      wrapTransaction: data.wrapTransaction || false,
      qPipelineStages: data.qPipelineStages || [],
      qCustomCols: data.qCustomCols || [],
      qColsOrder: data.qColsOrder || [],
      qCTEs: data.qCTEs || [],
      qWindowFuncs: data.qWindowFuncs || [],
      qSubqueries: data.qSubqueries || [],
      qUnions: data.qUnions || [],
    })
    useUIStore.setState({
      dialectId: data.dialectId || 'sqlserver',
      tablePos: data.tablePos || {},
      screen: Object.keys(data.tables || {}).length > 0 ? 'builder' : 'import',
      sidebarWidth: data.sidebarWidth || 210,
      sqlPanelWidth: data.sqlPanelWidth || 300,
      configHeight: data.configHeight || 210,
      sqlDock: data.sqlDock || 'docked',
      floatPos: data.floatPos || { x: 0, y: 60 },
      erdHidden: new Set(data.erdHidden || []),
      theme: data.theme || 'dark',
    })
  } catch (_) { /* ignore corrupt data */ }
}

function useTheme() {
  const theme = useUIStore(s => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])
}

function useSessionPersist() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) restoreSession(JSON.parse(raw))
    } catch (_) {}
  }, [])

  useEffect(() => {
    const saveAll = () => {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(serializeSession())) } catch (_) {}
    }
    const u1 = useSchemaStore.subscribe(saveAll)
    const u2 = useQueryStore.subscribe(saveAll)
    const u3 = useUIStore.subscribe(saveAll)
    return () => { u1(); u2(); u3() }
  }, [])
}

function useBroadcast() {
  useEffect(() => startBroadcasting(), [])
}

// ── Popout app ────────────────────────────────────────────────────────────────
function PopoutApp() {
  useEffect(() => startReceiving(), [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg0)' }}>
      <SQLPanel isPopout />
      <Toast />
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────────
function MainApp() {
  const screen = useUIStore(s => s.screen)
  useSessionPersist()
  useBroadcast()
  useTheme()

  return (
    <>
      <Header />
      {screen === 'import' ? <ImportScreen /> : <BuilderScreen />}
      <Toast />
    </>
  )
}

export default function App() {
  if (POPOUT_PANEL === 'sql') return <PopoutApp />
  return <MainApp />
}
