/* eslint-disable camelcase */
import * as fs from 'fs-extra'
import {readFile, writeFile} from 'node:fs/promises'
import path = require('node:path')
import {Connection, createConnection} from 'snowflake-sdk'
import toml = require('@iarna/toml')
import {PRIVILEGES, YamlDiff, YamlRoles, YamlUserGrants, YamlWarehouses} from './yaml'
import {AppliedCommand, Query, sqlQueries, sqlQuery} from './sql'

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

export interface ShowRole {
  created_on: Date,
  name: string;
  is_default: string;
  is_current: string;
  is_inherited: string;
  assigned_to_users: number;
  granted_to_roles: number;
  granted_roles: number;
  owner: string;
  comment: string;
}

export interface ShowRoleGrant {
  created_on: Date,
  privilege: string;
  name: string;
  grantee_name: string;
  grant_option: string;
  granted_by: string;
  granted_on: string;
  granted_to: string;
}

export interface ShowFutureRoleGrant {
  created_on: Date,
  privilege: string;
  name: string;
  grantee_name: string;
  grant_option: string;
  granted_by: string;
  grant_on: string;
  grant_to: string;
}

const sleep = (ms: number) => new Promise(r => {
  setTimeout(r, ms)
})

export async function listGrantsToRolesFullScan(conn: Connection, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<[ShowRoleGrant[], ShowFutureRoleGrant[]]> {
  const [batchedRoleNames, numRoles] = await getBatchedRoleNames(conn)
  onStart(numRoles)

  await sqlQuery(conn, 'alter session set multi_statement_count = 0;', []) // enable multi statement with batch size

  let roleGrants: ShowRoleGrant[] = []
  let futureRoleGrants: ShowFutureRoleGrant[] = []
  let numRolesQueried = 0

  for (const roleNames of batchedRoleNames) {
    // eslint-disable-next-line no-await-in-loop
    const _roleGrants = await queryRoleGrants(conn, roleNames)
    roleGrants = [...roleGrants, ..._roleGrants]

    // eslint-disable-next-line no-await-in-loop
    const _futureRoleGrants = await queryFutureRoleGrants(conn, roleNames)
    futureRoleGrants = [...futureRoleGrants, ..._futureRoleGrants]

    numRolesQueried += roleNames.length
    onProgress(numRolesQueried)

    // eslint-disable-next-line no-await-in-loop
    await sleep(1000)
  }

  return [roleGrants, futureRoleGrants]
}

async function queryRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowRoleGrant[]> {
  const queries: Query[] = roleNames.map(roleName => (['show grants to role identifier(?);', [roleName]]))
  const res = await sqlQueries<ShowRoleGrant>(conn, queries)

  let results: ShowRoleGrant[] = []
  for (const r of res) {
    results = [...results, ...r.results]
  }

  return results
}

async function queryFutureRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowFutureRoleGrant[]> {
  const queries: Query[] = roleNames.map(roleName => (['show future grants to role identifier(?);', [roleName]]))
  const res = await sqlQueries<ShowRoleGrant>(conn, queries)

  let results: ShowFutureRoleGrant[] = []
  for (const r of res) {
    results = [...results, ...r.results]
  }

  return results
}

async function getBatchedRoleNames(conn: Connection): Promise<[string[][], number]> {
  const batchSize = 10

  const showRoles = await sqlQuery<ShowRole>(conn, 'show roles;', [])
  const roleNames = showRoles.results.map(role => role.name.toLowerCase())

  const batchedRoleNames: string[][] = []

  let batchIndex = 0
  for (const roleName of roleNames) {
    if (batchedRoleNames[batchIndex]?.length >= batchSize) {
      batchIndex++
    }

    if (!batchedRoleNames[batchIndex]) {
      batchedRoleNames[batchIndex] = []
    }

    batchedRoleNames[batchIndex] = [...batchedRoleNames[batchIndex], roleName]
  }

  return [batchedRoleNames, roleNames.length]
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

export async function listGrantsToUsersFullScan(conn: Connection): Promise<UserGrant[]> {
  // query 'show roles;'
  // get roles into groups of 10
  // query 'show grants to role identifier(?);'
  // query 'show grants of role identifier(?);'
  return []
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
    for (const privilege of PRIVILEGES) {
      const objectLists = role[privilege] ?? {}
      for (const [objectType, objectIds] of Object.entries(objectLists)) {
        for (const objectId of objectIds) {
          const query = granted ? newGrantQuery(roleName, privilege, objectType, objectId) : newRevokeQuery(roleName, privilege, objectType, objectId)
          queries.push(query)
        }
      }
    }
  }

  return queries
}

function newGrantQuery(roleName: string, privilege: string, objectType: string, objectId: string): Query {
  // TODO(tyler): heavily sanitize all inputs
  if (privilege === 'usage' && objectType === 'role') {
    return ['grant role identifier(?) to role identifier(?);', [objectId, roleName]]
  }

  // extract (db.schema).<(objtype)>
  const rx = /^(\w*\.\w*)\.<(.*)>$/g
  const matches = rx.exec(objectId)
  if (matches) {
    const [, schema] = matches
    return [`grant ${privilege} on future ${objectType}s in schema identifier(?) to role identifier(?);`, [schema, roleName]]
  }

  return [`grant ${privilege} on ${objectType} identifier(?) to role identifier(?);`, [objectId, roleName]]
}

function newRevokeQuery(roleName: string, privilege: string, objectType: string, objectId: string): Query {
  // TODO(tyler): heavily sanitize all inputs
  if (privilege === 'usage' && objectType === 'role') {
    return ['revoke role identifier(?) from role identifier(?);', [objectId, roleName]]
  }

  // extract (db.schema).<(objtype)>
  const rx = /^(\w*\.\w*)\.<(.*)>$/g
  const matches = rx.exec(objectId)
  if (matches) {
    const [, schema] = matches
    return [`revoke ${privilege} on future ${objectType}s in schema identifier(?) from role identifier(?);`, [schema, roleName]]
  }

  return [`revoke ${privilege} on ${objectType} identifier(?) from role identifier(?);`, [objectId, roleName]]
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
