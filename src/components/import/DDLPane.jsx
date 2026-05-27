import { useRef } from 'react'
import { parseDDL } from '../../parsers/ddl.js'
import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'
import { useUIStore } from '../../store/useUIStore.js'

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
  const { setScreen, initTablePositions, showToast, setZoomPan } = useUIStore()

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

  return (
    <>
      <textarea ref={ref} placeholder={`Incolla qui il DDL generato da SSMS (CREATE TABLE ... ALTER TABLE ...)

Esempio:
CREATE TABLE [dbo].[Clienti](
    [ID] [int] IDENTITY NOT NULL,
    [Nome] [nvarchar](100) NOT NULL,
    CONSTRAINT [PK_Clienti] PRIMARY KEY ([ID])
)
GO
ALTER TABLE [dbo].[Ordini] ADD CONSTRAINT [FK_Ordini_Clienti]
    FOREIGN KEY([ClienteID]) REFERENCES [dbo].[Clienti]([ID])`} />
      <div className="ia">
        <button className="btn btn-p" onClick={() => go(ref.current.value.trim())}>Analizza Schema →</button>
        <label className="file-lbl">
          <span>📂</span> Carica file .sql
          <input type="file" accept=".sql,.txt" style={{ display: 'none' }} onChange={loadFile} />
        </label>
        <button className="btn btn-s btn-sm" onClick={() => { ref.current.value = DEMO_DDL; go(DEMO_DDL) }}>
          Demo Northwind
        </button>
      </div>
      <div className="info">
        <strong>Come esportare da SSMS:</strong>
        <ol>
          <li>Click destro sul database → <code>Tasks → Generate Scripts</code></li>
          <li>Seleziona <code>Select specific database objects</code> → spunta <strong>Tables</strong></li>
          <li>Click su <code>Advanced</code> → imposta <em>Types of data to script</em> = <code>Schema only</code></li>
          <li>Salva su file oppure copia negli appunti e incolla qui sopra</li>
        </ol>
      </div>
    </>
  )
}
