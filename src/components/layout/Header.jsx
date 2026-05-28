import { useState } from 'react'
import { useUIStore } from '../../store/useUIStore.js'
import { DIALECT_LIST } from '../../dialects/index.js'
import { SchemaHelpModal } from './SchemaHelpModal.jsx'
import './Header.css'

export function Header() {
  const { dialectId, setDialect, setScreen, theme, setTheme } = useUIStore()
  const [showHelp, setShowHelp] = useState(false)

  return (
    <header className="hdr">
      <h1 className="hdr-title" onClick={() => setScreen('import')} title="Torna alla schermata di import">
        SQL Query Builder
      </h1>
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
      <button
        className="help-btn"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
        style={{ fontSize: 15 }}
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>
      <button
        className="help-btn"
        onClick={() => setShowHelp(true)}
        title="Come esportare lo schema dal tuo database"
      >
        ℹ
      </button>
      {showHelp && <SchemaHelpModal onClose={() => setShowHelp(false)} />}
    </header>
  )
}
