import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import './StatusBar.css'

export function StatusBar() {
  const { tables, relationships } = useSchemaStore()
  const { qTables } = useQueryStore()
  const tableCount = Object.keys(tables).length
  const sel = [...qTables]

  return (
    <div className="status-bar">
      <div className="sdot" />
      <span>{tableCount} tabelle</span>
      <span className="sep">|</span>
      <span>{relationships.length} relazioni FK</span>
      <span className="sep">|</span>
      <span>{sel.length ? `Selezionate: ${sel.join(', ')}` : 'nessuna tabella selezionata'}</span>
    </div>
  )
}
