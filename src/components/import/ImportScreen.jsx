import { useState } from 'react'
import { DDLPane } from './DDLPane.jsx'
import { JSONPane } from './JSONPane.jsx'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import './ImportScreen.css'

export function ImportScreen() {
  const [tab, setTab] = useState('ddl')
  const tables = useSchemaStore(s => s.tables)
  const setScreen = useUIStore(s => s.setScreen)
  const tableCount = Object.keys(tables).length
  const hasSchema = tableCount > 0

  return (
    <div className="import-screen">
      <h2>Importa struttura del database</h2>
      <p className="desc">
        Esporta lo schema dal tuo DB, incollalo qui e il builder rileverà automaticamente tabelle, colonne e relazioni.
      </p>

      {hasSchema && (
        <div className="schema-banner">
          <span>Schema attivo: <strong>{tableCount} tabelle</strong> caricate.</span>
          <button className="btn btn-p btn-sm" onClick={() => setScreen('builder')}>
            ← Torna al builder
          </button>
        </div>
      )}

      <div className="icard">
        {hasSchema && (
          <div className="replace-warning">
            ⚠ Importare un nuovo schema sostituirà quello corrente e azzererà la query.
          </div>
        )}
        <div className="itabs">
          <button className={`itab${tab === 'ddl' ? ' on' : ''}`} onClick={() => setTab('ddl')}>DDL</button>
          <button className={`itab${tab === 'json' ? ' on' : ''}`} onClick={() => setTab('json')}>Query schema</button>
        </div>

        {tab === 'ddl' ? <DDLPane /> : <JSONPane />}
      </div>
    </div>
  )
}
