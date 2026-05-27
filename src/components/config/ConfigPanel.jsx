import { useUIStore } from '../../store/useUIStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { ColumnsPane } from './ColumnsPane.jsx'
import { JoinsPane } from './JoinsPane.jsx'
import { WherePane } from './WherePane.jsx'
import { GroupByPane } from './GroupByPane.jsx'
import { OrderByPane } from './OrderByPane.jsx'
import { DMLPane } from './DMLPane.jsx'
import { DDLQueryPane } from './DDLQueryPane.jsx'
import { MigrationPane } from './MigrationPane.jsx'
import { MongoStagesPane } from './MongoStagesPane.jsx'
import './ConfigPanel.css'

const SELECT_TABS = [
  { id: 'cols',     label: 'Colonne' },
  { id: 'joins',    label: 'JOIN' },
  { id: 'where',    label: 'WHERE' },
  { id: 'groupby',  label: 'GROUP BY' },
  { id: 'orderby',  label: 'ORDER BY' },
]

const DML_TYPES   = ['INSERT', 'UPDATE', 'DELETE']
const DDL_TYPES   = ['DDL', 'MIGRATION']

export function ConfigPanel({ style }) {
  const { activePanel, setActivePanel, dialectId } = useUIStore()
  const { queryType, setQueryType } = useQueryStore()

  const isMongo   = dialectId === 'mongodb'
  const isDML     = DML_TYPES.includes(queryType)
  const isDDL     = DDL_TYPES.includes(queryType)
  const isSelect  = queryType === 'SELECT'

  // Tabs shown for SELECT: add Pipeline tab when MongoDB
  const selectTabs = isMongo
    ? [...SELECT_TABS, { id: 'pipeline', label: '🔧 Pipeline' }]
    : SELECT_TABS

  return (
    <div className="cfgpanel" style={style}>
      {/* ── Query type bar ── */}
      <div className="qtype-bar">
        {/* DQL */}
        <button
          className={`qt-btn${queryType === 'SELECT' ? ' on' : ''}`}
          onClick={() => setQueryType('SELECT')}
        >SELECT</button>

        <span className="qt-sep" />

        {/* DML */}
        {DML_TYPES.map(t => (
          <button
            key={t}
            className={`qt-btn${queryType === t ? ' on' : ''}`}
            onClick={() => setQueryType(t)}
          >{t}</button>
        ))}

        {/* DDL — not for MongoDB (different paradigm, handled with validator snippet) */}
        {!isMongo && (
          <>
            <span className="qt-sep" />
            {DDL_TYPES.map(t => (
              <button
                key={t}
                className={`qt-btn qt-btn-ddl${queryType === t ? ' on' : ''}`}
                onClick={() => setQueryType(t)}
                title={t === 'DDL' ? 'Genera CREATE TABLE per tutto lo schema' : 'Genera script di migrazione ALTER TABLE'}
              >{t}</button>
            ))}
          </>
        )}
      </div>

      {/* ── Pane body ── */}
      {isSelect ? (
        <>
          <div className="cfgtabs">
            {selectTabs.map(t => (
              <div
                key={t.id}
                className={`cfgt${activePanel === t.id ? ' on' : ''}`}
                onClick={() => setActivePanel(t.id)}
              >
                {t.label}
              </div>
            ))}
          </div>
          <div className="cpanel">
            {activePanel === 'cols'     && <ColumnsPane />}
            {activePanel === 'joins'    && <JoinsPane />}
            {activePanel === 'where'    && <WherePane />}
            {activePanel === 'groupby'  && <GroupByPane />}
            {activePanel === 'orderby'  && <OrderByPane />}
            {activePanel === 'pipeline' && <MongoStagesPane />}
          </div>
        </>
      ) : isDML ? (
        <div className="cpanel">
          <DMLPane />
        </div>
      ) : queryType === 'DDL' ? (
        <div className="cpanel">
          <DDLQueryPane />
        </div>
      ) : queryType === 'MIGRATION' ? (
        <div className="cpanel">
          <MigrationPane />
        </div>
      ) : null}
    </div>
  )
}
