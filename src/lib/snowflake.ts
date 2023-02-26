import * as fs from 'fs-extra'
import {readFile, writeFile} from 'node:fs/promises'
import path = require('node:path')
import {Binds, Connection, createConnection} from 'snowflake-sdk'
import toml = require('@iarna/toml')

export const AUTHENTICATOR_PASSWORD = 'SNOWFLAKE'
export const SNOWSQL_CONFIG_DIR = path.join(process.env.HOME ?? '', '.snowsql')
export const SNOWSQL_CONFIG_FILE = path.join(SNOWSQL_CONFIG_DIR, 'config')

export async function getConnection({accountname, username, password}: ConnectionConfig): Promise<Connection> {
  const conn = createConnection({
    account: accountname ?? '',
    username: username ?? '',
    password,
    authenticator: AUTHENTICATOR_PASSWORD,
  })

  return new Promise((resolve, reject) => {
    conn.connect((err, conn) => {
      if (err) {
        console.log(err.message)
        reject(err)
      } else {
        resolve(conn)
      }
    })
  })
}

export interface Config {
  connections?: { [name: string]: ConnectionConfig };
}

export interface ConnectionConfig {
  accountname?: string;
  username?: string;
  password?: string;
  dbname?: string;
  schemaname?: string;
  warehousename?: string;
  rolename?: string;
  authenticator?: string;
}

export async function getConfig(): Promise<Config | null> {
  try {
    const data = await readFile(SNOWSQL_CONFIG_FILE)
    return toml.parse(data.toString())
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }

  return {}
}

export async function saveConfig(config: any): Promise<void> {
  const data = toml.stringify(config)
  await fs.mkdir(SNOWSQL_CONFIG_DIR, {recursive: true})
  await writeFile(SNOWSQL_CONFIG_FILE, data)
  await fs.chmod(SNOWSQL_CONFIG_FILE, 0o600)
}

export async function checkConnection(account: string): Promise<void> {
  const config = await getConfig()
  const connConfig = config?.connections?.[account]
  if (!connConfig) {
    throw new Error(`Failed to find connection config for account "${account}", please run "spyglass accounts:auth ${account}"`)
  }

  const conn = await getConnection(connConfig)
  await _sqlQuery(conn, 'SELECT 1;', [])
}

async function _sqlQuery(conn: Connection, sqlText: string, binds: Binds): Promise<any[]> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => {
        if (err) {
          reject(err)
        } else {
          if (rows) {
            resolve(rows)
            return
          }

          reject(new Error('no rows'))
        }
      },
    });
  });
}
