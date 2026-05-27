import { useUIStore } from '../../store/useUIStore.js'
import { DIALECT_LIST } from '../../dialects/index.js'
import './Header.css'

export function Header() {
  const { dialectId, setDialect } = useUIStore()

  return (
    <header className="hdr">
      <h1>SQL Query Builder</h1>
      <div className="dialect-picker">
        {DIALECT_LIST.map(d => (
          <button
            key={d.id}
            className={`dialect-btn${dialectId === d.id ? ' on' : ''}`}
            onClick={() => setDialect(d.id)}
            title={d.label}
          >
            <span>{d.icon}</span>
            <span className="dialect-label">{d.label}</span>
          </button>
        ))}
      </div>
    </header>
  )
}
