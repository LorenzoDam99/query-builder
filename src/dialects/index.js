import { sqlserver }  from './sqlserver.js'
import { postgresql } from './postgresql.js'
import { mysql }      from './mysql.js'
import { sqlite }     from './sqlite.js'
import { mongodb }    from './mongodb.js'

export const DIALECTS = { sqlserver, postgresql, mysql, sqlite, mongodb }

export const DIALECT_LIST = [sqlserver, postgresql, mysql, sqlite, mongodb]

export { sqlserver, postgresql, mysql, sqlite, mongodb }
