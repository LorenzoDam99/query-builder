# SQL Query Builder

Visual query builder for multiple SQL dialects and MongoDB. Build SELECT, INSERT, UPDATE, DELETE, DDL and migration scripts from an interactive ERD — without writing SQL by hand.

---

## Getting Started

```bash
npm install
npm run dev        # development server (http://localhost:5173)
npm run build      # production build → dist/
npm run preview    # preview production build
```

---

## Overview

The interface is divided into three areas:

```
┌─────────────────────────────────────────────────────────┐
│  Header — dialect selector · theme · title · help (ℹ)   │
├─────────────┬───────────────────────────┬───────────────┤
│             │                           │               │
│  Sidebar    │  ERD (entity-relation     │  SQL Panel    │
│  (tables)   │  diagram)                 │  (generated   │
│             │                           │   code)       │
├─────────────┴───────────────────────────┤               │
│  Config Panel (tabs: Colonne · JOIN ·   │               │
│  WHERE · GROUP BY · ORDER BY · SQL++)   │               │
└─────────────────────────────────────────┴───────────────┘
```

---

## Step 1 — Load a Schema

Click **"SQL Query Builder"** in the header (or the ← arrow in the SQL panel menu) to open the import screen.

### SQL dialects (SQL Server, PostgreSQL, MySQL, SQLite)

Paste a **DDL script** (`CREATE TABLE …`) in the **DDL** tab. Example:

```sql
CREATE TABLE Customers (
    CustomerID INT PRIMARY KEY,
    Name       NVARCHAR(100) NOT NULL,
    Email      NVARCHAR(200)
);

CREATE TABLE Orders (
    OrderID    INT PRIMARY KEY IDENTITY,
    CustomerID INT REFERENCES Customers(CustomerID),
    Total      DECIMAL(10,2),
    OrderDate  DATETIME
);
```

The parser detects primary keys, foreign keys and data types automatically.  
Click **Demo Northwind** (SQL Server only) to load a ready-made schema.

Alternatively use the **Query Schema** tab to paste a JSON schema:

```json
{
  "tables": {
    "Customers": {
      "cols": [
        { "name": "CustomerID", "type": "INT", "isPK": true },
        { "name": "Name",       "type": "NVARCHAR(100)", "nullable": false }
      ]
    }
  },
  "relationships": [
    { "from": { "table": "Orders", "col": "CustomerID" },
      "to":   { "table": "Customers", "col": "CustomerID" } }
  ]
}
```

### MongoDB

Switch to **MongoDB** in the dialect selector. The DDL tab is hidden — use the **Schema JSON** tab and paste the output of this mongosh script:

```js
const schema = {};
db.getCollectionNames().forEach(name => {
  const doc = db[name].findOne() || {};
  schema[name] = {
    cols: Object.entries(doc).map(([k, v]) => ({
      name: k,
      type: (v instanceof ObjectId || k === '_id') ? 'ObjectId'
          : (v instanceof Date)                    ? 'Date'
          : Array.isArray(v)                        ? 'Array'
          : typeof v === 'number'                   ? 'Number'
          : typeof v === 'boolean'                  ? 'Boolean'
          : 'String',
      isPK: k === '_id'
    }))
  };
});
print(JSON.stringify({ tables: schema, relationships: [] }, null, 2));
```

---

## Step 2 — Build a SELECT Query

After loading the schema, click a table title in the sidebar (or drag it onto the ERD) to add it to the query.

- **Foreign-key JOINs are detected automatically** — a toast confirms which joins were added (always `LEFT JOIN` by default).
- **Click a table title in the ERD** to toggle it in/out of the query.
- **Drag table cards** in the ERD to rearrange them visually.

### Columns tab

| Element | Function |
|---|---|
| Checkbox next to a column | Include/exclude from SELECT |
| **AS…** field (appears when checked) | Column alias |
| 🔑 / 🔗 icons | Primary key / foreign key indicator |
| **DISTINCT** checkbox | Adds `DISTINCT` to the SELECT |
| **LIMIT / TOP** number | Adds `LIMIT n` or `TOP n` |
| 🔍 filter | Filter visible columns by name |
| **Ordine SELECT** strip | Drag items to change output column order |
| **Colonne calcolate** | Add arbitrary SQL expressions (`prezzo * qty`, `UPPER(nome)`, `CASE WHEN …`) with optional alias |
| **Window functions** | Add `FUNC() OVER (PARTITION BY … ORDER BY …)` expressions — see §Window Functions |

### JOIN tab

Lists all detected relationships. Change each join type with the dropdown:  
`INNER` · `LEFT` · `RIGHT` · `FULL OUTER`

### WHERE tab

Add filter conditions row by row:

| Field | Options |
|---|---|
| Connector | AND / OR |
| Table.Column | dropdown from selected tables |
| Operator | `=` `<>` `<` `>` `<=` `>=` `LIKE` `IN` `IS NULL` `IS NOT NULL` `IN (subquery)` |
| Value | literal, `@paramName`, SQL expression like `GETDATE()` |

### GROUP BY tab

Left column — **checkboxes** to select grouping columns.  
Right column — **aggregates**: `COUNT` · `SUM` · `AVG` · `MIN` · `MAX` with alias.

> **Rule**: every column in SELECT must be either in GROUP BY or inside an aggregate.  
> The validation banner in the SQL panel flags violations automatically.

### ORDER BY tab

Add sort rules: table · column · `ASC`/`DESC`. Multiple entries are supported.

### SQL++ tab *(not available for MongoDB)*

Advanced SQL features — see dedicated sections below.

---

## Step 3 — DML (INSERT / UPDATE / DELETE)

Switch query type with the buttons at the top of the Config Panel.

### INSERT

- **Single table**: choose the target table, fill in values for each column. Identity/auto-increment columns are excluded automatically.
- **Multi-table** (toggle "Multi-tabella"): select multiple tables; INSERT statements are ordered automatically respecting FK dependencies (parent first).

### UPDATE

- Select the target table.
- Add SET rows (column → value).
- Add WHERE conditions. ⚠ Without WHERE, all rows are updated — the validation banner shows an error.

### DELETE

- **Single table**: select table + WHERE conditions. ⚠ Without WHERE, all rows are deleted.
- **Multi-table**: select tables; DELETE statements are ordered in reverse FK dependency (children first).

### Transaction wrapper

In the `⋯` menu → **Wrapper transazione** wraps the DML in `BEGIN TRANSACTION … COMMIT / ROLLBACK`.

---

## Step 4 — DDL & Migration

Available for all dialects except MongoDB.

### DDL

Generates `CREATE TABLE` statements for the entire loaded schema, including:
- Correct data types per dialect
- `PRIMARY KEY`, `NOT NULL`, `IDENTITY` / `SERIAL` / `AUTO_INCREMENT`
- Composite primary key constraints
- `CREATE INDEX IX_Table_Col` for every FK column

### MIGRATION

Paste a **baseline schema** (older version) — the tool diffs it against the current schema and generates:

```sql
ALTER TABLE Products ADD COLUMN Weight DECIMAL(8,2)
ALTER TABLE Customers DROP COLUMN OldField
CREATE TABLE NewTable (…)
```

---

## Step 5 — MongoDB Pipeline Builder

Switch dialect to **MongoDB** and query type to **SELECT**.

Use the **🔧 Pipeline** tab to build an aggregation pipeline stage by stage:

| Stage | Purpose |
|---|---|
| `$match` | Filter documents (equivalent to WHERE) |
| `$group` | Group and accumulate (`$sum`, `$avg`, `$count`, …) |
| `$project` | Select / rename / compute fields |
| `$sort` | Sort results |
| `$limit` / `$skip` | Pagination |
| `$lookup` | Join another collection |
| `$unwind` | Flatten an array field |

Drag stages with ▲▼ to reorder them. The generated code is a `db.collection.aggregate([…])` call.

---

## Advanced SQL (SQL++ tab)

### CTE — `WITH … AS (…)`

Define named sub-queries that can be referenced in the main SELECT:

```sql
WITH MonthlyTotals AS (
    SELECT CustomerID, SUM(Total) AS tot
    FROM Orders
    WHERE MONTH(OrderDate) = 1
)
SELECT c.Name, m.tot
FROM Customers c
LEFT JOIN MonthlyTotals m ON m.CustomerID = c.CustomerID
```

Add one row per CTE — give it a **name** and write the inner SQL.

### Subquery in FROM (derived tables)

Adds a `(SELECT …) AS alias` to the FROM clause with a configurable join type and ON condition:

```sql
LEFT JOIN (
    SELECT CustomerID, COUNT(*) AS n_orders
    FROM Orders
    GROUP BY CustomerID
) AS stats ON stats.CustomerID = Customers.CustomerID
```

Choose `LEFT JOIN` / `INNER JOIN` / `CROSS JOIN`, write the alias, inner SQL and ON condition.

### UNION / UNION ALL

Appends a second (or more) SELECT after the main query:

```sql
SELECT id, name, 'active'  AS source FROM Customers WHERE active = 1
UNION ALL
SELECT id, name, 'archived' AS source FROM CustomersArchive
```

`UNION` removes duplicates; `UNION ALL` keeps them (faster).

### Window Functions

In the **Colonne** tab → **Window functions** section:

| Function | Category | Needs column arg? |
|---|---|---|
| `ROW_NUMBER`, `RANK`, `DENSE_RANK` | Ranking | No |
| `NTILE`, `CUME_DIST`, `PERCENT_RANK` | Ranking | NTILE needs `n` |
| `LAG`, `LEAD` | Value | Yes (`col, offset, default`) |
| `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE` | Value | Yes |
| `SUM`, `AVG`, `COUNT`, `MIN`, `MAX` | Aggregate | Yes |

Example:

```sql
ROW_NUMBER() OVER (PARTITION BY DepartmentID ORDER BY Salary DESC) AS salary_rank
```

- **PARTITION BY**: write comma-separated column references (e.g. `DepartmentID`)
- **ORDER BY**: write sort expression (e.g. `Salary DESC`)

---

## SQL Panel

The panel on the right shows generated code in real time.

### `⋯` menu

| Action | Description |
|---|---|
| 📋 Copia SQL | Copy to clipboard |
| ⭐ Salva nei preferiti | Save with a custom name |
| ⬇ Scarica .sql / .js | Download as file |
| 🕑 Cronologia | Browse auto-saved history (searchable) |
| 🗂 Preferiti | Browse saved favorites (renameable) |
| ⇥ Importa SQL nel builder | Parse an existing SELECT and populate the builder |
| ⚙ Wrapper transazione | Toggle BEGIN/COMMIT wrapper |
| ← Torna allo schema | Go back to import screen |
| ⊞ Stacca pannello | Float the SQL panel (draggable) |
| ↺ Reset query | Clear all selections |

### Floating panel

Click **⊞ Stacca pannello** to detach the SQL panel into a floating window. Drag it anywhere. Drag it to the **right edge** of the screen to dock it back.

### Popout window

Open `/?popout=sql` in a second browser window for a dedicated SQL view that stays in sync via `BroadcastChannel`.

### Validation banner

Appears automatically when the query has issues:

| Severity | Examples |
|---|---|
| ✕ Error | Column in SELECT not in GROUP BY · UPDATE/DELETE without WHERE |
| ⚠ Warning | Cartesian product · ORDER BY column removed · HAVING without GROUP BY |

Click the banner header to collapse/expand the list.

---

## Query History & Favorites

**History** is saved automatically after 5 seconds of inactivity — no manual action needed. It deduplicates identical queries.

**Favorites** are saved manually via ⭐. Click the name in the favorites panel to rename inline.

Both panels have a search filter (🔍). All data is persisted in `localStorage`.

---

## Dialects

| Dialect | Identifier | Notes |
|---|---|---|
| SQL Server | `sqlserver` | `[brackets]` quoting · `TOP n` · `IDENTITY` · `GETDATE()` |
| PostgreSQL | `postgresql` | `"double quotes"` · `LIMIT` · `SERIAL` · `ILIKE` · `NOW()` |
| MySQL | `mysql` | `` `backticks` `` · `LIMIT` · `AUTO_INCREMENT` · relaxed GROUP BY |
| SQLite | `sqlite` | `"double quotes"` · `LIMIT` · `AUTOINCREMENT` · permissive rules |
| MongoDB | `mongodb` | Pipeline only · `$jsonSchema` DDL · ObjectId support |

Switch dialect from the dropdown in the header. The schema stays loaded; the generated code updates instantly.

---

## Keyboard & UX Tips

- **Click the "SQL Query Builder" title** → returns to the import screen
- **Click ☀ / 🌙** in the header → toggles light/dark theme
- **Click ℹ** → opens the schema help modal with per-dialect export instructions
- **Drag table cards** in the ERD to reposition them (positions are saved)
- **Hide a table** from the ERD via the 👁 button without removing it from the query
- **Column order strip**: appears when ≥ 2 columns are selected — drag to reorder SELECT output
- **@paramName** in any value field → rendered as a parameter placeholder (not quoted)
- **SQL expressions** like `GETDATE()`, `NOW()`, `gen_random_uuid()` → rendered unquoted automatically

---

## Session Persistence

The entire session (schema, query state, panel sizes, positions, theme, history, favorites) is saved automatically in `localStorage`. Refreshing the page restores everything.

To start fresh: use **↺ Reset query** to clear the current query, or reload the schema from the import screen.

---

## Project Structure

```
src/
├── components/
│   ├── config/        # Config panel tabs (Columns, JOIN, WHERE, GROUP BY, ORDER BY, SQL++, DML, DDL…)
│   ├── erd/           # ERD canvas + relation arrows
│   ├── import/        # Import screen (DDL, JSON panes)
│   ├── layout/        # Header, SchemaHelpModal
│   ├── sql/           # SQL Panel + CSS
│   └── ui/            # Toast
├── dialects/          # Per-dialect config (quoting, types, DDL column defs)
├── parsers/           # DDL parser, JSON schema parser, SELECT SQL parser
├── sql/               # Query builder, DDL builder, schema diff, validation, topo-sort
├── store/             # Zustand stores (query, schema, UI, history, favorites)
├── styles/            # CSS tokens (dark + light theme)
└── sync/              # BroadcastChannel cross-window sync
```
