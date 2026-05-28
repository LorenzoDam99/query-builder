import { useRef } from 'react'
import { parseDDL } from '../../parsers/ddl.js'
import { parseSchemaJSON } from '../../parsers/jsonSchema.js'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'

// ── Per-dialect config ────────────────────────────────────────────────────────
const DIALECT_DDL = {
  sqlserver: {
    placeholder: `Incolla qui il DDL generato da SSMS (CREATE TABLE ... ALTER TABLE ...)

Esempio:
CREATE TABLE [dbo].[Clienti](
    [ID] [int] IDENTITY(1,1) NOT NULL,
    [Nome] [nvarchar](100) NOT NULL,
    CONSTRAINT [PK_Clienti] PRIMARY KEY ([ID])
)
GO
ALTER TABLE [dbo].[Ordini] ADD CONSTRAINT [FK_Ordini_Clienti]
    FOREIGN KEY([ClienteID]) REFERENCES [dbo].[Clienti]([ID])`,
    info: (
      <>
        <strong>Come esportare da SSMS:</strong>
        <ol>
          <li>Click destro sul database → <code>Tasks → Generate Scripts</code></li>
          <li>Seleziona <code>Select specific database objects</code> → spunta <strong>Tables</strong></li>
          <li>Click su <code>Advanced</code> → imposta <em>Types of data to script</em> = <code>Schema only</code></li>
          <li>Salva su file oppure copia negli appunti e incolla qui sopra</li>
        </ol>
      </>
    ),
  },
  postgresql: {
    placeholder: `Incolla qui il DDL PostgreSQL (CREATE TABLE ... ALTER TABLE ...)

Esempio:
CREATE TABLE public.clienti (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(255)
);
ALTER TABLE public.ordini
    ADD CONSTRAINT fk_ordini_clienti
    FOREIGN KEY (cliente_id) REFERENCES public.clienti(id);`,
    info: (
      <>
        <strong>Come esportare da PostgreSQL:</strong>
        <ol>
          <li>Da <strong>pgAdmin</strong>: click destro sullo schema → <code>Backup…</code> → formato <code>Plain</code> → spunta solo <em>Schema</em></li>
          <li>Da terminale: <code>pg_dump --schema-only -t public.* nomedb &gt; schema.sql</code></li>
          <li>Incolla il contenuto del file qui sopra</li>
        </ol>
      </>
    ),
  },
  mysql: {
    placeholder: `Incolla qui il DDL MySQL (CREATE TABLE ... ALTER TABLE ...)

Esempio:
CREATE TABLE \`clienti\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`nome\` VARCHAR(100) NOT NULL,
    PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
ALTER TABLE \`ordini\`
    ADD CONSTRAINT \`fk_ordini_clienti\`
    FOREIGN KEY (\`cliente_id\`) REFERENCES \`clienti\` (\`id\`);`,
    info: (
      <>
        <strong>Come esportare da MySQL:</strong>
        <ol>
          <li>Da <strong>MySQL Workbench</strong>: <code>Server → Data Export</code> → seleziona il database → spunta <em>Dump Structure Only</em></li>
          <li>Da terminale: <code>mysqldump --no-data nomedb &gt; schema.sql</code></li>
          <li>Incolla il contenuto qui sopra</li>
        </ol>
      </>
    ),
  },
  sqlite: {
    placeholder: `Incolla qui il DDL SQLite (CREATE TABLE ...)

Esempio:
CREATE TABLE clienti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT
);
CREATE TABLE ordini (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    FOREIGN KEY (cliente_id) REFERENCES clienti(id)
);`,
    info: (
      <>
        <strong>Come ottenere il DDL da SQLite:</strong>
        <ol>
          <li>Da <strong>DB Browser for SQLite</strong>: tab <em>Database Structure</em> → click destro sulla tabella → <code>Copy Create statement</code></li>
          <li>Da terminale sqlite3: <code>.schema</code> per tutte le tabelle</li>
          <li>Incolla le istruzioni CREATE TABLE qui sopra</li>
        </ol>
      </>
    ),
  },
}

const DEMO_DDL = `CREATE TABLE [dbo].[Customers](
  [CustomerID] [nchar](5) NOT NULL,
  [CompanyName] [nvarchar](40) NOT NULL,
  [ContactName] [nvarchar](30) NULL,
  [Country] [nvarchar](15) NULL,
  [City] [nvarchar](15) NULL,
  CONSTRAINT [PK_Customers] PRIMARY KEY ([CustomerID])
)
GO
CREATE TABLE [dbo].[Employees](
  [EmployeeID] [int] IDENTITY(1,1) NOT NULL,
  [LastName] [nvarchar](20) NOT NULL,
  [FirstName] [nvarchar](10) NOT NULL,
  [Title] [nvarchar](30) NULL,
  [HireDate] [datetime] NULL,
  [ReportsTo] [int] NULL,
  CONSTRAINT [PK_Employees] PRIMARY KEY ([EmployeeID])
)
GO
CREATE TABLE [dbo].[Categories](
  [CategoryID] [int] IDENTITY(1,1) NOT NULL,
  [CategoryName] [nvarchar](15) NOT NULL,
  [Description] [ntext] NULL,
  CONSTRAINT [PK_Categories] PRIMARY KEY ([CategoryID])
)
GO
CREATE TABLE [dbo].[Products](
  [ProductID] [int] IDENTITY(1,1) NOT NULL,
  [ProductName] [nvarchar](40) NOT NULL,
  [CategoryID] [int] NULL,
  [UnitPrice] [money] NULL,
  [UnitsInStock] [smallint] NULL,
  [Discontinued] [bit] NOT NULL,
  CONSTRAINT [PK_Products] PRIMARY KEY ([ProductID])
)
GO
CREATE TABLE [dbo].[Orders](
  [OrderID] [int] IDENTITY(1,1) NOT NULL,
  [CustomerID] [nchar](5) NULL,
  [EmployeeID] [int] NULL,
  [OrderDate] [datetime] NULL,
  [ShipCountry] [nvarchar](15) NULL,
  CONSTRAINT [PK_Orders] PRIMARY KEY ([OrderID])
)
GO
CREATE TABLE [dbo].[Order Details](
  [OrderID] [int] NOT NULL,
  [ProductID] [int] NOT NULL,
  [UnitPrice] [money] NOT NULL,
  [Quantity] [smallint] NOT NULL,
  [Discount] [real] NOT NULL,
  CONSTRAINT [PK_Order_Details] PRIMARY KEY ([OrderID],[ProductID])
)
GO
ALTER TABLE [dbo].[Products] WITH CHECK ADD CONSTRAINT [FK_Products_Categories] FOREIGN KEY([CategoryID]) REFERENCES [dbo].[Categories] ([CategoryID])
GO
ALTER TABLE [dbo].[Orders] WITH CHECK ADD CONSTRAINT [FK_Orders_Customers] FOREIGN KEY([CustomerID]) REFERENCES [dbo].[Customers] ([CustomerID])
GO
ALTER TABLE [dbo].[Orders] WITH CHECK ADD CONSTRAINT [FK_Orders_Employees] FOREIGN KEY([EmployeeID]) REFERENCES [dbo].[Employees] ([EmployeeID])
GO
ALTER TABLE [dbo].[Order Details] WITH CHECK ADD CONSTRAINT [FK_Order_Details_Orders] FOREIGN KEY([OrderID]) REFERENCES [dbo].[Orders] ([OrderID])
GO
ALTER TABLE [dbo].[Order Details] WITH CHECK ADD CONSTRAINT [FK_Order_Details_Products] FOREIGN KEY([ProductID]) REFERENCES [dbo].[Products] ([ProductID])
GO`

export function DDLPane() {
  const ref = useRef()
  const setSchema = useSchemaStore(s => s.setSchema)
  const resetQuery = useQueryStore(s => s.reset)
  const { dialectId, setScreen, initTablePositions, showToast, setZoomPan } = useUIStore()

  const cfg = DIALECT_DDL[dialectId]

  function go(sql) {
    if (!sql.trim()) { showToast('⚠ Incolla prima il DDL'); return }
    try {
      const schema = parseDDL(sql)
      setSchema(schema)
      resetQuery()
      initTablePositions(schema.tables)
      setZoomPan(1, 0, 0)
      useUIStore.setState({ needsFit: true })
      setScreen('builder')
      showToast(`✓ ${Object.keys(schema.tables).length} tabelle, ${schema.relationships.length} relazioni caricate`)
    } catch (e) {
      showToast('❌ ' + e.message)
    }
  }

  function loadFile(e) {
    const f = e.target.files[0]
    if (!f) return
    const r = new FileReader()
    r.onload = ev => go(ev.target.result)
    r.readAsText(f)
  }

  // MongoDB: no DDL — show mongosh script + textarea for JSON output
  if (dialectId === 'mongodb') {
    function goMongo() {
      const raw = ref.current?.value?.trim()
      if (!raw) { showToast('⚠ Incolla prima il JSON dello schema'); return }
      try {
        const schema = parseSchemaJSON(raw)
        setSchema(schema)
        resetQuery()
        initTablePositions(schema.tables)
        setZoomPan(1, 0, 0)
        useUIStore.setState({ needsFit: true })
        setScreen('builder')
        showToast(`✓ ${Object.keys(schema.tables).length} collection caricate`)
      } catch (e) {
        showToast('❌ ' + e.message)
      }
    }

    return (
      <>
        <div className="info" style={{ marginBottom: 14 }}>
          <strong>Esporta lo schema con mongosh:</strong>
          <ol>
            <li>Apri <strong>mongosh</strong> e connettiti: <code>use nomedb</code></li>
            <li>Esegui questo script:</li>
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
            <li>Copia l'output JSON e incollalo qui sotto</li>
          </ol>
          <p style={{ marginTop: 6, color: 'var(--t1)', fontSize: 11.5 }}>
            In alternativa usa <strong>MongoDB Compass</strong> → tab <em>Schema</em> per analizzare i campi, poi costruisci il JSON manualmente.
          </p>
        </div>
        <textarea
          ref={ref}
          placeholder={`Incolla qui l'output JSON dello script mongosh:

[
  { "TABLE_NAME": "ordini",  "COLUMN_NAME": "_id",        "DATA_TYPE": "objectId", "IS_PK": "YES" },
  { "TABLE_NAME": "ordini",  "COLUMN_NAME": "cliente_id", "DATA_TYPE": "objectId", "IS_PK": "NO"  },
  { "TABLE_NAME": "clienti", "COLUMN_NAME": "_id",        "DATA_TYPE": "objectId", "IS_PK": "YES" }
]`}
        />
        <div className="ia">
          <button className="btn btn-p" onClick={goMongo}>Analizza Schema →</button>
        </div>
      </>
    )
  }

  return (
    <>
      <textarea ref={ref} placeholder={cfg.placeholder} />
      <div className="ia">
        <button className="btn btn-p" onClick={() => go(ref.current.value.trim())}>Analizza Schema →</button>
        <label className="file-lbl">
          <span>📂</span> Carica file .sql
          <input type="file" accept=".sql,.txt" style={{ display: 'none' }} onChange={loadFile} />
        </label>
        {dialectId === 'sqlserver' && (
          <button className="btn btn-s btn-sm" onClick={() => { ref.current.value = DEMO_DDL; go(DEMO_DDL) }}>
            Demo Northwind
          </button>
        )}
      </div>
      <div className="info">{cfg.info}</div>
    </>
  )
}
