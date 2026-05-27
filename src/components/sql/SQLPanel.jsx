import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useGeneratedCode } from '../../sql/useQueryBuilder.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import { useHistoryStore } from '../../store/useHistoryStore.js'
import { useFavoritesStore } from '../../store/useFavoritesStore.js'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { validateQuery } from '../../sql/validate.js'
import { DIALECTS } from '../../dialects/index.js'
import { parseSelectSQL } from '../../parsers/selectParser.js'
import './SQLPanel.css'

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function onNonPlaceholder(s, marker, fn) {
  const re = new RegExp(`(${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`)
  return s.split(re).map((seg, i) => i % 2 === 0 ? fn(seg) : seg).join('')
}

function hlSQL(sql) {
  const kws = ['SELECT','FROM','WHERE','JOIN','INNER','LEFT','RIGHT','FULL','OUTER','ON','AS','GROUP BY','GROUP','BY','ORDER','AND','OR','IN','LIKE','ILIKE','IS','NULL','NOT','DISTINCT','HAVING','UNION','ALL','TOP','OVER','PARTITION','LIMIT','OFFSET']
  const MARK = '\x01'
  const literals = []
  let s = sql.replace(/'[^']*'/g, m => { literals.push(escHtml(m)); return `${MARK}${literals.length - 1}${MARK}` })
  s = onNonPlaceholder(s, MARK, escHtml)
  s = onNonPlaceholder(s, MARK, seg =>
    seg.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="sql-nm">$1</span>')
       .replace(/--[^\n]*/g, m => `<span class="sql-cm">${m}</span>`)
  )
  s = onNonPlaceholder(s, MARK, seg => {
    kws.forEach(k => { seg = seg.replace(new RegExp(`\\b(${k})\\b`, 'gi'), '<span class="sql-kw">$1</span>') })
    return seg
  })
  s = onNonPlaceholder(s, MARK, seg =>
    seg.replace(/\[([\w\s]+)\]/g, '<span class="sql-tb">[$1]</span>')
       .replace(/"([\w\s]+)"/g, '<span class="sql-tb">"$1"</span>')
       .replace(/`([\w\s]+)`/g, '<span class="sql-tb">`$1`</span>')
  )
  s = s.replace(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'), (_, i) => `<span class="sql-st">${literals[+i]}</span>`)
  return s
}

function hlMongo(code) {
  const STAGE_OPS = ['\\$lookup','\\$match','\\$group','\\$project','\\$unwind','\\$sort','\\$limit','\\$skip','\\$count','\\$addFields','\\$replaceRoot','\\$out','\\$merge']
  const AGG_OPS   = ['\\$sum','\\$avg','\\$min','\\$max','\\$push','\\$addToSet','\\$first','\\$last','\\$multiply','\\$divide','\\$subtract','\\$add']
  const CMP_OPS   = ['\\$eq','\\$ne','\\$gt','\\$gte','\\$lt','\\$lte','\\$in','\\$nin','\\$regex','\\$exists','\\$and','\\$or','\\$not','\\$nor']
  const MARK = '\x01'
  const literals = []
  let s = code.replace(/"[^"]*"/g, m => { literals.push(escHtml(m)); return `${MARK}${literals.length - 1}${MARK}` })
  s = onNonPlaceholder(s, MARK, escHtml)
  s = onNonPlaceholder(s, MARK, seg =>
    seg.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="sql-nm">$1</span>')
       .replace(/\/\/[^\n]*/g, m => `<span class="sql-cm">${m}</span>`)
  )
  s = onNonPlaceholder(s, MARK, seg => {
    STAGE_OPS.forEach(op => { seg = seg.replace(new RegExp(`(${op})(?=\\s*:)`, 'g'), '<span class="sql-kw">$1</span>') })
    AGG_OPS.concat(CMP_OPS).forEach(op => { seg = seg.replace(new RegExp(`(${op})\\b`, 'g'), '<span class="sql-co">$1</span>') })
    seg = seg.replace(/\b(db)\b/g, '<span class="sql-kw">$1</span>')
    seg = seg.replace(/\b(aggregate|find|findOne)\b/g, '<span class="sql-kw">$1</span>')
    return seg
  })
  s = s.replace(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'), (_, i) => `<span class="sql-tb">${literals[+i]}</span>`)
  return s
}

function hlCode(code, dialectId) {
  return dialectId === 'mongodb' ? hlMongo(code) : hlSQL(code)
}

export function SQLPanel({ style, isPopout = false }) {
  const code = useGeneratedCode()
  const qs = useQueryStore()
  const { resetQuery, queryType, wrapTransaction, setWrapTransaction, loadFromParsed } = qs

  // Parse SQL modal state
  const [showParseModal, setShowParseModal] = useState(false)
  const [parseSQLText, setParseSQLText]     = useState('')
  const [parseError, setParseError]         = useState('')
  const { setScreen, showToast, dialectId, sqlDock, setSqlDock, floatPos, setFloatPos, sqlPanelWidth } = useUIStore()
  const { entries: histEntries, push, remove: removeHist, clear: clearHist } = useHistoryStore()
  const { entries: favEntries, add: addFav, remove: removeFav, rename: renameFav, clear: clearFav } = useFavoritesStore()
  const schema = useSchemaStore()
  const dialect = DIALECTS[dialectId]

  // null | 'history' | 'favs'
  const [sidePanel, setSidePanel] = useState(null)
  const [showDockHint, setShowDockHint] = useState(false)

  // Save-favorite inline form
  const [showSaveFav, setShowSaveFav] = useState(false)
  const [saveFavName, setSaveFavName] = useState('')
  const saveFavInputRef = useRef(null)

  // Inline rename for favorites
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')

  const prevCodeRef = useRef('')
  const panelRef = useRef(null)

  const isFloating = sqlDock === 'floating' && !isPopout
  const issues = validateQuery(schema, qs)

  // ── History auto-save: 5s debounce + dedup ────────────────────────────────
  useEffect(() => {
    if (code === prevCodeRef.current) return
    if (code.startsWith('--') || code.startsWith('//')) return
    prevCodeRef.current = code
    const timer = setTimeout(() => {
      // Don't add if identical to the most recent entry
      if (histEntries[0]?.code === code) return
      push({
        id: Date.now(),
        ts: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        dialectId,
        queryType,
        code,
        label: code.split('\n')[0].slice(0, 60),
      })
    }, 5000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // Focus the name input when save-fav form opens
  useEffect(() => {
    if (showSaveFav) saveFavInputRef.current?.focus()
  }, [showSaveFav])

  // ── Actions ───────────────────────────────────────────────────────────────

  function copyCode() {
    navigator.clipboard.writeText(code)
      .then(() => showToast('✓ Copiato negli appunti'))
      .catch(() => {
        const ta = document.createElement('textarea')
        ta.value = code; document.body.appendChild(ta)
        ta.select(); document.execCommand('copy')
        document.body.removeChild(ta)
        showToast('✓ Copiato')
      })
  }

  function exportFile() {
    const ext = dialectId === 'mongodb' ? 'js' : 'sql'
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `query.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`✓ File query.${ext} scaricato`)
  }

  function backToImport() { setScreen('import') }

  function applyParsedSQL() {
    const parsed = parseSelectSQL(parseSQLText)
    if (!parsed) {
      setParseError('Impossibile analizzare la query. Verifica che sia un SELECT valido.')
      return
    }
    loadFromParsed(parsed)
    setShowParseModal(false)
    setParseSQLText('')
    setParseError('')
    showToast('✓ Query importata nel builder')
  }

  function openSaveFav() {
    setSaveFavName(code.split('\n')[0].slice(0, 60))
    setShowSaveFav(true)
  }

  function confirmSaveFav() {
    addFav(saveFavName, code, dialectId, queryType)
    setShowSaveFav(false)
    showToast('⭐ Salvato nei preferiti')
  }

  function startRename(fav) {
    setRenamingId(fav.id)
    setRenameVal(fav.name)
  }

  function confirmRename(id) {
    renameFav(id, renameVal)
    setRenamingId(null)
  }

  // ── Float / dock ──────────────────────────────────────────────────────────

  function detachPanel() {
    const el = panelRef.current
    const rect = el?.getBoundingClientRect()
    setFloatPos({
      x: rect ? rect.left : Math.max(0, window.innerWidth - sqlPanelWidth - 20),
      y: rect ? rect.top : 60,
    })
    setSqlDock('floating')
  }

  function dockPanel() {
    setSqlDock('docked')
    setShowDockHint(false)
  }

  function handleTitleMouseDown(e) {
    if (!isFloating) return
    if (e.target.closest('.btn') || e.target.closest('button')) return
    e.preventDefault()

    const startX = e.clientX - floatPos.x
    const startY = e.clientY - floatPos.y

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    function onMove(e) {
      const newX = e.clientX - startX
      const newY = Math.max(0, e.clientY - startY)
      setFloatPos({ x: newX, y: newY })
      setShowDockHint(e.clientX > window.innerWidth - 130)
    }

    function onUp(e) {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setShowDockHint(false)
      // Guard against synthetic/zero clientX
      if (e.clientX > 0 && e.clientX > window.innerWidth - 130) dockPanel()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const label = dialect.supportsSQL ? 'SQL generato' : 'Pipeline generata'

  const floatStyle = isFloating
    ? { left: floatPos.x, top: floatPos.y, width: sqlPanelWidth }
    : undefined

  // ── History panel ─────────────────────────────────────────────────────────
  const historyPanel = (
    <div className="hist-panel">
      <div className="hist-hd">
        <span>Cronologia ({histEntries.length})</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {histEntries.length > 0 && <button className="hist-clear" onClick={clearHist}>Svuota</button>}
          <button className="hist-close" onClick={() => setSidePanel(null)} title="Torna alla query">✕</button>
        </div>
      </div>
      <div className="hist-list">
        {histEntries.length === 0 && <div className="hist-empty">Nessuna query in cronologia.</div>}
        {histEntries.map(e => (
          <div key={e.id} className="hist-item">
            <div className="hist-meta">
              <span className="hist-ts">{e.ts}</span>
              <span className="hist-di">{e.dialectId}</span>
              <span className="hist-qt">{e.queryType}</span>
            </div>
            <pre className="hist-code">{e.label}</pre>
            <div className="hist-actions">
              <button className="btn btn-s btn-sm" onClick={() => {
                navigator.clipboard.writeText(e.code).catch(() => {})
                showToast('✓ Query copiata')
              }}>Copia</button>
              <button className="hist-rm" onClick={() => removeHist(e.id)} title="Rimuovi">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Favorites panel ───────────────────────────────────────────────────────
  const favsPanel = (
    <div className="hist-panel">
      <div className="hist-hd">
        <span>Preferiti ({favEntries.length})</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {favEntries.length > 0 && <button className="hist-clear" onClick={clearFav}>Svuota</button>}
          <button className="hist-close" onClick={() => setSidePanel(null)} title="Torna alla query">✕</button>
        </div>
      </div>
      <div className="hist-list">
        {favEntries.length === 0 && (
          <div className="hist-empty">
            Nessun preferito salvato.<br />
            <span style={{ fontSize: 10, opacity: .7 }}>Usa ⭐ per salvare la query corrente.</span>
          </div>
        )}
        {favEntries.map(fav => (
          <div key={fav.id} className="hist-item">
            <div className="fav-name-row">
              {renamingId === fav.id ? (
                <input
                  className="fav-rename-input"
                  value={renameVal}
                  autoFocus
                  onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmRename(fav.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => confirmRename(fav.id)}
                />
              ) : (
                <span className="fav-name" title="Clicca per rinominare" onClick={() => startRename(fav)}>
                  {fav.name}
                </span>
              )}
            </div>
            <div className="hist-meta">
              <span className="hist-ts">{fav.ts}</span>
              <span className="hist-di">{fav.dialectId}</span>
              <span className="hist-qt">{fav.queryType}</span>
            </div>
            <pre className="hist-code">{fav.code.split('\n')[0].slice(0, 60)}</pre>
            <div className="hist-actions">
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-s btn-sm" onClick={() => {
                  navigator.clipboard.writeText(fav.code).catch(() => {})
                  showToast('✓ Query copiata')
                }}>Copia</button>
                <button className="btn btn-s btn-sm" onClick={() => startRename(fav)} title="Rinomina">✏️</button>
              </div>
              <button className="hist-rm" onClick={() => removeFav(fav.id)} title="Rimuovi">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Save-favorite inline form ─────────────────────────────────────────────
  const saveFavForm = showSaveFav && (
    <div className="save-fav-form">
      <span className="save-fav-label">⭐ Nome preferito</span>
      <input
        ref={saveFavInputRef}
        className="save-fav-input"
        value={saveFavName}
        onChange={e => setSaveFavName(e.target.value)}
        placeholder="es. Report vendite mensili"
        onKeyDown={e => {
          if (e.key === 'Enter') confirmSaveFav()
          if (e.key === 'Escape') setShowSaveFav(false)
        }}
      />
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <button className="btn btn-p btn-sm" style={{ flex: 1 }} onClick={confirmSaveFav}>Salva</button>
        <button className="btn btn-s btn-sm" onClick={() => setShowSaveFav(false)}>✕</button>
      </div>
    </div>
  )

  const panel = (
    <div
      ref={panelRef}
      className={[
        'sql-panel',
        isFloating ? 'sql-panel-floating' : '',
        isPopout  ? 'sql-panel-popout'   : '',
      ].filter(Boolean).join(' ')}
      style={isFloating ? floatStyle : style}
    >
      {/* Title bar */}
      <div
        className={`sql-ph${isFloating ? ' sql-ph-drag' : ''}`}
        onMouseDown={handleTitleMouseDown}
      >
        <h3>
          {isFloating && <span className="drag-grip" title="Trascina per spostare">⠿ </span>}
          {isPopout ? '⊞ ' : ''}{label}
        </h3>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>

          {/* History toggle */}
          <button
            className={`btn btn-s btn-sm${sidePanel === 'history' ? ' active' : ''}`}
            onClick={() => setSidePanel(p => p === 'history' ? null : 'history')}
            title="Cronologia query"
          >
            🕑 {histEntries.length}
          </button>

          {/* Favorites toggle */}
          <button
            className={`btn btn-s btn-sm${sidePanel === 'favs' ? ' active' : ''}`}
            onClick={() => setSidePanel(p => p === 'favs' ? null : 'favs')}
            title="Query preferite"
          >
            ⭐ {favEntries.length}
          </button>

          {/* Parse SQL → builder (only SQL dialects, SELECT mode) */}
          {dialectId !== 'mongodb' && !isPopout && (
            <button
              className="btn btn-s btn-sm"
              onClick={() => { setShowParseModal(true); setParseSQLText(''); setParseError('') }}
              title="Importa query SQL nel builder"
            >
              ⇥ SQL
            </button>
          )}

          {!isPopout && !isFloating && (
            <button
              className="btn btn-s btn-sm"
              onClick={detachPanel}
              title="Stacca pannello"
            >
              ⊞
            </button>
          )}
          {isFloating && (
            <button
              className="btn btn-s btn-sm"
              onClick={dockPanel}
              title="Aggancia a destra"
            >
              ⊟
            </button>
          )}
          {/* Transaction wrapper toggle — only for DML in SQL dialects */}
          {!isPopout && ['INSERT','UPDATE','DELETE'].includes(queryType) && dialectId !== 'mongodb' && (
            <button
              className={`btn btn-s btn-sm${wrapTransaction ? ' active' : ''}`}
              onClick={() => setWrapTransaction(!wrapTransaction)}
              title={wrapTransaction ? 'Rimuovi wrapper transazione' : 'Aggiungi BEGIN/COMMIT'}
            >
              ⚙ TX
            </button>
          )}
          {!isPopout && !isFloating && (
            <button className="btn btn-s btn-sm" onClick={resetQuery} title="Azzera la query (mantiene le tabelle nell'ERD)">Reset</button>
          )}
        </div>
      </div>

      {/* Validation banner */}
      {issues.length > 0 && (
        <div className="val-banner">
          {issues.map((iss, i) => (
            <div key={i} className={`val-issue val-${iss.severity}`}>
              {iss.severity === 'error' ? '✕' : '⚠'} {iss.message}
            </div>
          ))}
        </div>
      )}

      {/* Main content area */}
      {sidePanel === 'history' ? historyPanel
        : sidePanel === 'favs' ? favsPanel
        : (
          <div className="sql-out-wrap">
            <button
              className="sql-copy-btn"
              onClick={() => copyCode()}
              title={`Copia ${dialect.supportsSQL ? 'SQL' : 'Pipeline'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="10" height="13" rx="2"/>
                <path d="M5 6H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1"/>
              </svg>
            </button>
            <div className="sql-out">
              <pre
                className="sql-pre"
                dangerouslySetInnerHTML={{ __html: hlCode(code, dialectId) }}
              />
            </div>
          </div>
        )
      }

      {/* Save-favorite inline form */}
      {saveFavForm}

      {/* Actions bar */}
      <div className="sql-actions">
        <button className="btn btn-p btn-sm" onClick={() => copyCode()} style={{ flex: 1 }}>
          📋 Copia {dialect.supportsSQL ? 'SQL' : 'Pipeline'}
        </button>
        <button
          className="btn btn-s btn-sm"
          onClick={showSaveFav ? () => setShowSaveFav(false) : openSaveFav}
          title="Salva nei preferiti"
          style={showSaveFav ? { color: 'var(--ac)' } : {}}
        >
          ⭐
        </button>
        <button className="btn btn-s btn-sm" onClick={exportFile}>⬇ .{dialectId === 'mongodb' ? 'js' : 'sql'}</button>
        {!isPopout && !isFloating && (
          <button className="btn btn-s btn-sm" onClick={backToImport}>← Schema</button>
        )}
      </div>
    </div>
  )

  // ── Parse SQL modal ───────────────────────────────────────────────────────
  const parseSQLModal = showParseModal && createPortal(
    <div className="subq-overlay" onClick={e => { if (e.target === e.currentTarget) setShowParseModal(false) }}>
      <div className="subq-modal" style={{ width: 540, maxWidth: '95vw' }}>
        <div className="subq-hd">
          <span>⇥ Importa SQL nel builder</span>
          <button className="hist-close" onClick={() => setShowParseModal(false)}>✕</button>
        </div>
        <div className="subq-body">
          <p style={{ fontSize: 11.5, color: 'var(--t2)', marginBottom: 8 }}>
            Incolla una query SELECT e il builder verrà popolato automaticamente con tabelle, colonne, JOIN e condizioni WHERE.
          </p>
          <textarea
            className="parse-sql-ta"
            value={parseSQLText}
            onChange={e => { setParseSQLText(e.target.value); setParseError('') }}
            placeholder="SELECT o.id, o.total FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.total > 100 ORDER BY o.total DESC"
            rows={8}
            autoFocus
          />
          {parseError && <div className="parse-sql-err">{parseError}</div>}
        </div>
        <div className="subq-footer">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-s btn-sm" onClick={() => setShowParseModal(false)}>Annulla</button>
            <button
              className="btn btn-p btn-sm"
              onClick={applyParsedSQL}
              disabled={!parseSQLText.trim()}
            >
              ✓ Importa nel builder
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )

  if (isFloating) {
    return createPortal(
      <>
        {panel}
        {showDockHint && (
          <div className="dock-hint-right">
            <span>⊟ Aggancia a destra</span>
          </div>
        )}
        {parseSQLModal}
      </>,
      document.body
    )
  }

  return <>{panel}{parseSQLModal}</>
}
