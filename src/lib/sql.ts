import {Binds, Connection} from 'snowflake-sdk'

export type Query = [string, Binds]

export interface AppliedCommand {
  sql: string;
  dryRun: boolean;
  applied: boolean;
  results: any[];
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

  const sql2 = sql.replace(/(identifier\(')([\w.\\]+)('\))/g, '$2') // replace "identifier('foo')" with "foo"
  return sql2
}

export async function sqlQuery<T>(conn: Connection, sqlText: string, binds: Binds, dryRun = false): Promise<AppliedCommand> {
  const res = {
    sql: interpolateQuery([sqlText, binds]),
    dryRun,
    applied: false,
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
          reject(err)
        } else {
          if (rows) {
            res.applied = true
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
