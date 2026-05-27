import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useUIStore } from '../../store/useUIStore.js'

export function DDLQueryPane() {
  const tables = useSchemaStore(s => s.tables)
  const dialectId = useUIStore(s => s.dialectId)
  const tableNames = Object.keys(tables)

  if (!tableNames.length) return (
    <div className="empty">
      <div className="ei">📋</div>
      Nessuno schema caricato.<br />
      <span style={{ fontSize: 11, opacity: .7 }}>Importa uno schema DDL o JSON per generare i CREATE TABLE.</span>
    </div>
  )

  return (
    <div className="ddl-info-pane">
      <div className="ddl-info-hd">
        {dialectId === 'mongodb' ? '📄 Schema validator (JSON Schema)' : '📋 CREATE TABLE'}
      </div>
      <div className="ddl-info-body">
        <p>
          {dialectId === 'mongodb'
            ? `Verranno generate le definizioni <code>$jsonSchema</code> per tutte le <strong>${tableNames.length}</strong> collection caricate.`
            : `Verranno generati gli script <strong>CREATE TABLE</strong> per tutte le <strong>${tableNames.length}</strong> tabelle dello schema caricato.`
          }
        </p>
        <ul className="ddl-table-list">
          {tableNames.map(n => (
            <li key={n} className="ddl-table-item">
              <span className="ddl-table-name">{n}</span>
              <span className="ctype">{(tables[n]?.cols || []).length} col</span>
            </li>
          ))}
        </ul>
        <div className="ddl-hint">
          💡 Il codice viene generato nel pannello a destra in tempo reale.
        </div>
      </div>
    </div>
  )
}
