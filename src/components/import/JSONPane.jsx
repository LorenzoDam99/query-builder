import { useRef } from 'react'
import { parseSchemaJSON } from '../../parsers/jsonSchema.js'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'

// Per-dialect schema extraction queries / instructions
const DIALECT_HINTS = {
  sqlserver: {
    label: 'SQL Server / SSMS',
    query: `SELECT c.TABLE_NAME,c.COLUMN_NAME,c.DATA_TYPE,c.IS_NULLABLE,
  IIF(pk.COLUMN_NAME IS NOT NULL,'YES','NO') IS_PK,
  fk2.TABLE_NAME FK_TABLE,fk2.COLUMN_NAME FK_COLUMN
FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t ON c.TABLE_NAME=t.TABLE_NAME AND t.TABLE_TYPE='BASE TABLE'
LEFT JOIN(SELECT ku.TABLE_NAME,ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME=ku.CONSTRAINT_NAME
  WHERE tc.CONSTRAINT_TYPE='PRIMARY KEY')pk ON c.TABLE_NAME=pk.TABLE_NAME AND c.COLUMN_NAME=pk.COLUMN_NAME
LEFT JOIN(SELECT ku.TABLE_NAME,ku.COLUMN_NAME,ku2.TABLE_NAME REFERENCED_TABLE,ku2.COLUMN_NAME REFERENCED_COLUMN
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON rc.CONSTRAINT_NAME=ku.CONSTRAINT_NAME
  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku2 ON rc.UNIQUE_CONSTRAINT_NAME=ku2.CONSTRAINT_NAME)fk2
  ON c.TABLE_NAME=fk2.TABLE_NAME AND c.COLUMN_NAME=fk2.COLUMN_NAME
ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION
FOR JSON PATH`,
    instruction: 'Esegui la query in SSMS, poi copia il risultato JSON e incollalo qui.',
  },

  postgresql: {
    label: 'PostgreSQL',
    query: `SELECT
  c.table_name AS "TABLE_NAME",
  c.column_name AS "COLUMN_NAME",
  c.data_type AS "DATA_TYPE",
  c.is_nullable AS "IS_NULLABLE",
  CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END AS "IS_PK",
  fk.foreign_table_name AS "FK_TABLE",
  fk.foreign_column_name AS "FK_COLUMN"
FROM information_schema.columns c
JOIN information_schema.tables t
  ON c.table_name=t.table_name AND t.table_schema='public' AND t.table_type='BASE TABLE'
LEFT JOIN (
  SELECT kcu.table_name,kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
  WHERE tc.constraint_type='PRIMARY KEY'
) pk ON c.table_name=pk.table_name AND c.column_name=pk.column_name
LEFT JOIN (
  SELECT kcu.table_name,kcu.column_name,
         ccu.table_name AS foreign_table_name,ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY'
) fk ON c.table_name=fk.table_name AND c.column_name=fk.column_name
WHERE c.table_schema='public'
ORDER BY c.table_name,c.ordinal_position`,
    instruction: 'Esegui la query in psql o pgAdmin, poi converti il risultato in JSON (es. con json_agg o uno strumento esterno) e incollalo qui.',
  },

  mysql: {
    label: 'MySQL',
    query: `SELECT
  c.TABLE_NAME,c.COLUMN_NAME,c.DATA_TYPE,c.IS_NULLABLE,
  CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'YES' ELSE 'NO' END AS IS_PK,
  fk.REFERENCED_TABLE_NAME AS FK_TABLE,
  fk.REFERENCED_COLUMN_NAME AS FK_COLUMN
FROM information_schema.COLUMNS c
JOIN information_schema.TABLES t
  ON c.TABLE_NAME=t.TABLE_NAME AND c.TABLE_SCHEMA=t.TABLE_SCHEMA AND t.TABLE_TYPE='BASE TABLE'
LEFT JOIN (
  SELECT kcu.TABLE_NAME,kcu.COLUMN_NAME
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_NAME=kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA=kcu.TABLE_SCHEMA
  WHERE tc.CONSTRAINT_TYPE='PRIMARY KEY'
) pk ON c.TABLE_NAME=pk.TABLE_NAME AND c.COLUMN_NAME=pk.COLUMN_NAME
LEFT JOIN (
  SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_SCHEMA=DATABASE()
) fk ON c.TABLE_NAME=fk.TABLE_NAME AND c.COLUMN_NAME=fk.COLUMN_NAME
WHERE c.TABLE_SCHEMA=DATABASE()
ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION`,
    instruction: 'Esegui la query in MySQL Workbench o client equivalente, esporta il risultato in JSON e incollalo qui.',
  },

  sqlite: {
    label: 'SQLite',
    query: null,
    instruction: 'SQLite non ha INFORMATION_SCHEMA. Usa il tab "DDL da SSMS" e incolla il DDL (CREATE TABLE ...). Il parser supporta la sintassi SQLite standard.',
  },

  mongodb: {
    label: 'MongoDB',
    query: null,
    instruction: (
      <>
        <strong>Esporta lo schema con mongosh:</strong>
        <ol>
          <li>Connettiti al database: <code>use nomedb</code></li>
          <li>Esegui questo script per estrarre automaticamente la struttura:</li>
        </ol>
        <pre className="ddl-script-block">{`const out = [];
db.getCollectionNames().forEach(coll => {
  const doc = db[coll].findOne();
  if (!doc) return;
  Object.entries(doc).forEach(([f, v]) => {
    out.push({
      TABLE_NAME: coll, COLUMN_NAME: f,
      DATA_TYPE: Array.isArray(v) ? 'array'
        : v && typeof v === 'object' ? (v._bsontype ?? 'object')
        : typeof v,
      IS_NULLABLE: 'YES',
      IS_PK: f === '_id' ? 'YES' : 'NO'
    });
  });
});
print(JSON.stringify(out, null, 2));`}</pre>
        <ol start={3}>
          <li>Copia l'output JSON e incollalo nella textarea qui sopra</li>
        </ol>
        <p style={{ marginTop: 6, color: 'var(--t1)', fontSize: 11.5 }}>
          In alternativa usa <strong>MongoDB Compass</strong> → tab <em>Schema</em> per ispezionare i campi, poi costruisci il JSON manualmente.
        </p>
      </>
    ),
  },
}

export function JSONPane() {
  const ref = useRef()
  const setSchema = useSchemaStore(s => s.setSchema)
  const resetQuery = useQueryStore(s => s.reset)
  const { dialectId, setScreen, initTablePositions, showToast, setZoomPan } = useUIStore()

  const hint = DIALECT_HINTS[dialectId] || DIALECT_HINTS.sqlserver

  function go() {
    const raw = ref.current.value.trim()
    if (!raw) { showToast('⚠ Incolla prima il JSON'); return }
    try {
      const schema = parseSchemaJSON(raw)
      setSchema(schema)
      resetQuery()
      initTablePositions(schema.tables)
      setZoomPan(1, 0, 0)
      useUIStore.setState({ needsFit: true })
      setScreen('builder')
      showToast(`✓ ${Object.keys(schema.tables).length} tabelle caricate`)
    } catch (e) {
      showToast('❌ ' + e.message)
    }
  }

  return (
    <>
      {hint.query ? (
        <textarea
          ref={ref}
          placeholder={`Risultato JSON della query schema.\nEsegui questa query in ${hint.label} e incolla il risultato:\n\n${hint.query}`}
        />
      ) : (
        <textarea
          ref={ref}
          placeholder="Incolla qui il JSON schema nel formato atteso..."
        />
      )}
      <div className="ia">
        <button className="btn btn-p" onClick={go}>Analizza Schema →</button>
      </div>
      <div className="info">{hint.instruction}</div>
    </>
  )
}
