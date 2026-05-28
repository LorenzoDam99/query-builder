import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useUIStore } from '../../store/useUIStore.js'
import { DIALECT_LIST } from '../../dialects/index.js'

const HINTS = {
  sqlserver: {
    ddl: {
      title: 'DDL da SSMS',
      steps: [
        <>Click destro sul database → <code>Tasks → Generate Scripts</code></>,
        <>Seleziona <code>Select specific database objects</code> → spunta <strong>Tables</strong></>,
        <>Click su <code>Advanced</code> → imposta <em>Types of data to script</em> = <code>Schema only</code></>,
        <>Salva su file o copia negli appunti, poi incolla nel tab <strong>DDL</strong></>,
      ],
    },
    json: {
      title: 'Query schema JSON',
      steps: [
        <>Apri una nuova query in SSMS sul database target</>,
        <>Incolla ed esegui la query mostrata nel tab <strong>Query schema</strong> (usa <code>FOR JSON PATH</code>)</>,
        <>Copia il risultato JSON e incollalo nel tab <strong>Query schema</strong></>,
      ],
    },
  },
  postgresql: {
    ddl: {
      title: 'DDL da pg_dump / pgAdmin',
      steps: [
        <>Da terminale: <code>pg_dump --schema-only nomedb &gt; schema.sql</code></>,
        <>Da <strong>pgAdmin</strong>: click destro sullo schema → <code>Backup…</code> → formato <em>Plain</em> → solo <em>Schema</em></>,
        <>Incolla il contenuto nel tab <strong>DDL</strong></>,
      ],
    },
    json: {
      title: 'Query schema JSON',
      steps: [
        <>Apri <strong>pgAdmin</strong> o psql sul database target</>,
        <>Esegui la query mostrata nel tab <strong>Query schema</strong></>,
        <>Esporta il risultato come JSON (in pgAdmin: <code>Download as JSON</code>) e incollalo</>,
      ],
    },
  },
  mysql: {
    ddl: {
      title: 'DDL da mysqldump / Workbench',
      steps: [
        <>Da terminale: <code>mysqldump --no-data nomedb &gt; schema.sql</code></>,
        <>Da <strong>MySQL Workbench</strong>: <code>Server → Data Export</code> → seleziona il DB → <em>Dump Structure Only</em></>,
        <>Incolla il contenuto nel tab <strong>DDL</strong></>,
      ],
    },
    json: {
      title: 'Query schema JSON',
      steps: [
        <>Apri <strong>MySQL Workbench</strong> o un client equivalente</>,
        <>Esegui la query mostrata nel tab <strong>Query schema</strong></>,
        <>Esporta il risultato come JSON e incollalo nel tab <strong>Query schema</strong></>,
      ],
    },
  },
  sqlite: {
    ddl: {
      title: 'DDL da DB Browser / sqlite3',
      steps: [
        <>Da <strong>DB Browser for SQLite</strong>: tab <em>Database Structure</em> → click destro su ogni tabella → <code>Copy Create statement</code></>,
        <>Da terminale: apri il file con <code>sqlite3 nomefile.db</code> poi digita <code>.schema</code></>,
        <>Copia tutte le istruzioni <code>CREATE TABLE</code> e incollale nel tab <strong>DDL</strong></>,
      ],
    },
    json: {
      title: 'Nota SQLite',
      steps: [
        <>SQLite non supporta <code>INFORMATION_SCHEMA</code>.</>,
        <>Usa direttamente il tab <strong>DDL</strong> con il metodo sopra.</>,
      ],
    },
  },
  mongodb: {
    ddl: {
      title: 'Esporta schema con mongosh',
      steps: [
        <>Apri <strong>mongosh</strong> e connettiti al database: <code>use nomedb</code></>,
        <>Esegui questo script — campiona un documento per ogni collection e genera il JSON:</>,
        <><pre className="help-code-block">{`const out = [];
db.getCollectionNames().forEach(coll => {
  const doc = db[coll].findOne();
  if (!doc) return;
  Object.entries(doc).forEach(([f, v]) => {
    out.push({
      TABLE_NAME: coll,
      COLUMN_NAME: f,
      DATA_TYPE: Array.isArray(v) ? 'array'
        : v && typeof v === 'object' ? (v._bsontype ?? 'object')
        : typeof v,
      IS_NULLABLE: 'YES',
      IS_PK: f === '_id' ? 'YES' : 'NO'
    });
  });
});
print(JSON.stringify(out, null, 2));`}</pre></>,
        <>Copia l'output JSON e incollalo nel tab <strong>Query schema</strong></>,
      ],
    },
    json: {
      title: 'Compass / schema manuale',
      steps: [
        <>Da <strong>MongoDB Compass</strong>: apri una collection → tab <em>Schema</em> → analizza i campi, poi costruisci manualmente il JSON</>,
        <>Formato atteso (una riga per ogni campo di ogni collection):</>,
        <><pre className="help-code-block">{`[
  { "TABLE_NAME": "ordini",
    "COLUMN_NAME": "_id",
    "DATA_TYPE": "objectId",
    "IS_NULLABLE": "YES",
    "IS_PK": "YES" },
  { "TABLE_NAME": "ordini",
    "COLUMN_NAME": "cliente_id",
    "DATA_TYPE": "objectId",
    "IS_NULLABLE": "YES",
    "IS_PK": "NO" }
]`}</pre></>,
        <>Incolla nel tab <strong>Query schema</strong> e clicca <em>Analizza Schema</em></>,
      ],
    },
  },
}

export function SchemaHelpModal({ onClose }) {
  const { dialectId } = useUIStore()
  const [tab, setTab] = useState(dialectId)

  // Close on Escape
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const hint = HINTS[tab] || HINTS.sqlserver
  const dialect = DIALECT_LIST.find(d => d.id === tab)

  return createPortal(
    <div className="help-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="help-modal">

        <div className="help-hd">
          <span className="help-title">ℹ Come esportare lo schema</span>
          <button className="hist-close" onClick={onClose}>✕</button>
        </div>

        {/* Dialect tabs */}
        <div className="help-dialect-tabs">
          {DIALECT_LIST.map(d => (
            <button
              key={d.id}
              className={`help-dtab${tab === d.id ? ' on' : ''}`}
              onClick={() => setTab(d.id)}
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>

        <div className="help-body">
          {/* DDL section */}
          <div className="help-section">
            <div className="help-section-title">📄 {hint.ddl.title}</div>
            <ol className="help-steps">
              {hint.ddl.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          {/* JSON section */}
          <div className="help-section">
            <div className="help-section-title">🔢 {hint.json.title}</div>
            <ol className="help-steps">
              {hint.json.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          <div className="help-footer-note">
            💡 Puoi anche cliccare <strong>← Torna allo schema</strong> nel menu ⋯ del pannello SQL per tornare alla pagina di import.
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}
