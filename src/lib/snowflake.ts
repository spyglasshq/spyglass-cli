import * as fs from 'fs-extra'
import {readFile, writeFile} from 'node:fs/promises'
import path = require('node:path')
import {Connection, createConnection} from 'snowflake-sdk'
import toml = require('@iarna/toml')
import {YamlDiff, YamlRoles, YamlUserGrants, YamlWarehouses} from './yaml'
import {AppliedCommand, Query, sqlQuery} from './sql'

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

export async function getSnowflakeConfig(): Promise<Config | null> {
  // env var contents overrides default config location, used in CI/CD
  if (process.env.SNOWSQL_CONFIG) {
    return toml.parse(process.env.SNOWSQL_CONFIG)
  }

  // otherwise, default to known config location
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

export async function getConn(accountId: string): Promise<Connection> {
  const config = await getSnowflakeConfig()
  const connConfig = config?.connections?.[accountId]
  if (!connConfig) {
    throw new Error(`Failed to find connection config for account "${accountId}", please run "spyglass accounts:auth ${accountId}" or set the SNOWSQL_CONFIG secret/environment variable.`)
  }

  return getConnection(connConfig)
}

export async function checkConnection(accountId: string): Promise<void> {
  const conn = await getConn(accountId)
  await sqlQuery(conn, 'SELECT 1;', [])
}

const grantsToRolesQuery = 'select * from snowflake.account_usage.grants_to_roles where deleted_on is null;'

export interface RoleGrant {
  PRIVILEGE: string;
  TABLE_CATALOG: string;
  TABLE_SCHEMA: string;
  NAME: string;
  GRANTED_ON: string;
  GRANTED_TO: string;
  GRANTEE_NAME: string;
}

export async function listGrantsToRoles(conn: Connection): Promise<RoleGrant[]> {
  return (await sqlQuery<RoleGrant[]>(conn, grantsToRolesQuery, [])).results
}

export async function listGrantsToRolesFullScan(conn: Connection): Promise<RoleGrant[]> {
  // query 'show roles;'
  // get roles into groups of 10
  // query 'show grants to role identifier(?);'
  // query 'show grants of role identifier(?);'
  return []
}

const grantsToUsersQuery = 'select * from snowflake.account_usage.grants_to_users where deleted_on is null;'

export interface UserGrant {
  CREATED_ON: string;
  DELETED_ON: string;
  ROLE: string;
  GRANTED_TO: string;
  GRANTEE_NAME: string;
  GRANTED_BY: string;
}

export async function listGrantsToUsers(conn: Connection): Promise<UserGrant[]> {
  return (await sqlQuery<UserGrant[]>(conn, grantsToUsersQuery, [])).results
}

const showWarehousesQuery = 'show warehouses;'

export interface Warehouse {
  name: string;
  size: string;
  // eslint-disable-next-line camelcase
  auto_suspend: number;
}

export async function showWarehouses(conn: Connection): Promise<Warehouse[]> {
  return (await sqlQuery<Warehouse[]>(conn, showWarehousesQuery, [])).results
}

export async function executeCommands(accountId: string, queries: Query[], dryRun = false): Promise<AppliedCommand[]> {
  const conn = await getConn(accountId)

  let results: AppliedCommand[] = []

  for (const query of queries) {
    // eslint-disable-next-line no-await-in-loop
    const res = await sqlQuery(conn, query[0], query[1], dryRun)

    results = [...results, res]
  }

  return results
}

export function sqlCommandsFromYamlDiff(yamlDiff: YamlDiff): Query[] {
  return [
    ...getRoleGrantQueries(yamlDiff.added.roleGrants, true),
    ...getRoleGrantQueries(yamlDiff.deleted.roleGrants, false),

    ...getUserGrantQueries(yamlDiff.added.userGrants, true),
    ...getUserGrantQueries(yamlDiff.deleted.userGrants, false),

    ...getWarehouseQueries(yamlDiff.updated.warehouses),
  ]
}

function getRoleGrantQueries(yamlRoles: YamlRoles, granted: boolean): Query[] {
  if (!yamlRoles) return []

  const queries: Query[] = []

  for (const [roleName, role] of Object.entries(yamlRoles)) {
    for (const [privilege, objectLists] of Object.entries(role)) {
      for (const [objectType, objectIds] of Object.entries(objectLists)) {
        for (const objectId of objectIds) {
          const query = granted ? newGrantQuery(privilege, objectType) : newRevokeQuery(privilege, objectType)
          queries.push([query, [objectId, roleName]])
        }
      }
    }
  }

  return queries
}

function newGrantQuery(privilege: string, objectType: string): string {
  // TODO(tyler): heavily sanitize all inputs
  if (privilege === 'usage' && objectType === 'role') {
    return 'grant role identifier(?) to role identifier(?)'
  }

  return `grant ${privilege} on ${objectType} identifier(?) to role identifier(?);`
}

function newRevokeQuery(privilege: string, objectType: string): string {
  // TODO(tyler): heavily sanitize all inputs
  if (privilege === 'usage' && objectType === 'role') {
    return 'revoke role identifier(?) from role identifier(?)'
  }

  return `revoke ${privilege} on ${objectType} identifier(?) from role identifier(?);`
}

function getUserGrantQueries(yamlUserGrants: YamlUserGrants, granted: boolean): Query[] {
  if (!yamlUserGrants) return []

  const queries: Query[] = []

  for (const [username, user] of Object.entries(yamlUserGrants)) {
    for (const roleName of user.roles) {
      const query = granted ?
        'grant role identifier(?) to user identifier(?);' :
        'revoke role identifier(?) from user identifier(?);'
      queries.push([query, [roleName, username]])
    }
  }

  return queries
}

function getWarehouseQueries(yamlWarehouses: YamlWarehouses): Query[] {
  if (!yamlWarehouses) return []

  const queries: Query[] = []

  for (const [warehouseName, warehouse] of Object.entries(yamlWarehouses)) {
    if (warehouse?.size) {
      queries.push(['alter warehouse identifier(?) set warehouse_size = ?;', [warehouseName, warehouse.size]])
    }
  }

  return queries
}
