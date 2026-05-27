import { useRef } from 'react'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import { parseDDL } from '../../parsers/ddl.js'
import { parseJSONSchema } from '../../parsers/jsonSchema.js'

export function MigrationPane() {
  const { tables, relationships, baseSchema, setBaseSchema, clearBaseSchema } = useSchemaStore()
  const showToast = useUIStore(s => s.showToast)
  const fileRef = useRef(null)

  const hasCurrentSchema = Object.keys(tables).length > 0

  function loadBaseFromFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result.trim()
      try {
        let parsed
        if (text.startsWith('[') || text.startsWith('{')) {
          parsed = parseJSONSchema(JSON.parse(text))
        } else {
          parsed = parseDDL(text)
        }
        setBaseSchema(parsed)
        showToast(`✓ Schema base caricato: ${Object.keys(parsed.tables).length} tabelle`)
      } catch (err) {
        showToast('✕ Errore nel parsing dello schema base')
        console.error(err)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function loadBasePaste(text) {
    try {
      let parsed
      const t = text.trim()
      if (t.startsWith('[') || t.startsWith('{')) {
        parsed = parseJSONSchema(JSON.parse(t))
      } else {
        parsed = parseDDL(t)
      }
      setBaseSchema(parsed)
      showToast(`✓ Schema base caricato: ${Object.keys(parsed.tables).length} tabelle`)
    } catch (err) {
      showToast('✕ Errore nel parsing dello schema base')
    }
  }

  if (!hasCurrentSchema) return (
    <div className="empty">
      <div className="ei">🔄</div>
      Carica prima uno schema corrente tramite la schermata di import.
    </div>
  )

  return (
    <div className="migration-pane">
      <div className="migration-section">
        <div className="migration-hd">Schema corrente</div>
        <div className="migration-schema-info migration-curr">
          <span className="mig-badge mig-curr">ATTUALE</span>
          <strong>{Object.keys(tables).length}</strong> tabelle,&nbsp;
          <strong>{relationships.length}</strong> relazioni
        </div>
      </div>

      <div className="migration-section">
        <div className="migration-hd">Schema base (versione precedente)</div>
        {baseSchema ? (
          <div className="migration-schema-info migration-base">
            <span className="mig-badge mig-base">BASE</span>
            <strong>{Object.keys(baseSchema.tables || {}).length}</strong> tabelle
            &nbsp;
            <button className="btn btn-s btn-sm" style={{ marginLeft: 'auto' }} onClick={clearBaseSchema}>
              × Rimuovi
            </button>
          </div>
        ) : (
          <div className="migration-upload">
            <p className="migration-desc">
              Carica lo schema della versione precedente del database per generare lo script di migrazione.
              Supporta DDL (<code>.sql</code>) e JSON schema export.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-s btn-sm"
                onClick={() => fileRef.current?.click()}
              >
                📂 Carica file…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".sql,.json,.txt"
                style={{ display: 'none' }}
                onChange={loadBaseFromFile}
              />
              <button
                className="btn btn-s btn-sm"
                onClick={() => {
                  const text = window.prompt('Incolla DDL o JSON schema della versione precedente:')
                  if (text?.trim()) loadBasePaste(text)
                }}
              >
                📋 Incolla…
              </button>
            </div>
          </div>
        )}
      </div>

      {baseSchema && (
        <div className="migration-section">
          <div className="migration-hint">
            💡 Lo script di migrazione viene generato nel pannello a destra in tempo reale.
          </div>
        </div>
      )}

      {!baseSchema && (
        <div className="migration-hint">
          ℹ Senza schema base viene mostrata la lista completa di tabelle (come se fosse tutto nuovo).
        </div>
      )}
    </div>
  )
}
