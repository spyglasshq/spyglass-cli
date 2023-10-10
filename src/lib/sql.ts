import {Bind, Connection} from 'snowflake-sdk'

export type Query = [string, Bind[]]

export interface AppliedCommand {
  sql: string;
  dryRun: boolean;
  executed: boolean;
  results: any[];
  error?: string;
  errorCode?: number;
  entities?: Entity[];
}

export interface QueryOptions {
  dryRun?: boolean;
  dontReject?: boolean;
}

export interface SqlCommand {
  query: Query;
  entities: Entity[];
}

export interface Entity {
  type: string;
  id: string;
  action?: 'create' | 'update' | 'delete';
}

// interpolateQuery is only used for debugging, not for actually templating strings for queries!!!
function interpolateQuery(q: Query): string {
  let [sql] = q
  const [, binds] = q
  const match = sql.match(/\?/g)
  if (match?.length) {
    for (let i = 0; i < match.length; i++) {
      sql = sql.replace('?', "'" + binds[i] + "'")
    }
  }

  // eslint-disable-next-line unicorn/better-regex, no-useless-escape
  const sql2 = sql.replace(/(IDENTIFIER\(')([\w.\.]+)('\))/g, '$2') // replace "IDENTIFIER('foo')" with "foo"
  return sql2
}

export async function sqlQuery<T>(conn: Connection, sqlText: string, binds: Bind[], q?: QueryOptions): Promise<AppliedCommand> {
  const dryRun = q?.dryRun ?? false
  const dontReject = q?.dontReject ?? false

  const res: AppliedCommand = {
    sql: interpolateQuery([sqlText, binds]),
    dryRun,
    executed: false,
    results: [] as T[],
  }
  if (dryRun) {
    return res
  }

  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => {
        if (err) {
          if (dontReject) {
            res.error = err.message
            res.errorCode = err.code
            resolve(res)
          } else {
            reject(err)
          }
        } else {
          if (rows) {
            res.executed = true
            res.results = rows
            resolve(res)
            return
          }

          reject(new Error('no rows'))
        }
      },
    })
  })
}

export async function sqlQueries<T>(conn: Connection, queries: Query[], q?: QueryOptions): Promise<AppliedCommand[]> {
  const promises = queries.map(([sqlText, binds]) => sqlQuery<T>(conn, sqlText, binds, q))
  return Promise.all(promises)
}

export async function sqlQueriesV2<T>(conn: Connection, queries: Query[], dryRun = false): Promise<AppliedCommand> {
  // FIX: This whole thing seems broken for DDL queries at least

  let sqlText = ''
  let binds: Bind[] = []

  for (const [_sqlText, _binds] of queries) {
    sqlText += _sqlText
    binds = [...binds, ..._binds]
  }

  const allRows: AppliedCommand = {
    sql: interpolateQuery([sqlText, binds]),
    dryRun,
    executed: false,
    results: [] as T[],
  }

  if (dryRun) {
    return allRows
  }

  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => {
        if (err) {
          reject(err)
        } else {
          for (const row of rows ?? []) {
            console.log(row.grantee_name, row.privilege, row.granted_on, row.name)
          }

          const stream = stmt.streamRows()
          stream.on('error', function (err) {
            reject(err)
          })

          stream.on('data', function (row) {
            console.log(row.grantee_name, row.privilege, row.granted_on, row.name)

            allRows.results = [...allRows.results, row as T]

            // @ts-expect-error: this snowflake type didn't get updated or something
            if (stmt.hasNext()) {
              // @ts-expect-error: this snowflake type didn't get updated or something
              // eslint-disable-next-line new-cap
              stmt.NextResult()
            } else {
              resolve(allRows)
            }
          })
        }
      },
    })
  })
}
