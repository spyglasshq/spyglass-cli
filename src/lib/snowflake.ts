/* eslint-disable camelcase */
import * as fs from 'fs-extra'
import {readFile, writeFile} from 'node:fs/promises'
import path = require('node:path')
import {Connection, createConnection} from 'snowflake-sdk'
import toml = require('@iarna/toml')
import {PRIVILEGES, YamlDiff, YamlRoleDefinitions, YamlRoles, YamlUserGrants, YamlWarehouses} from './yaml'
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
    const config = toml.parse(data.toString()) as Config
    return normalizeAccountIds(config)
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export function normalizeAccountIds(cfg: Config): Config {
  const normCfg: Config = {}

  for (const [accountId, connection] of Object.entries(cfg.connections ?? {})) {
    const connections = normCfg.connections ?? {}

    connections[accountId.toLowerCase()] = {
      ...connection,
      accountname: connection.accountname?.toLowerCase(),
    }

    normCfg.connections = connections
  }

  return normCfg
}

export async function saveConfig(config: Config): Promise<void> {
  const data = toml.stringify(config as any)
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

export interface ShowRoleGrantOf {
  created_on: Date;
  role: string;
  granted_to: string;
  grantee_name: string;
  granted_by: string;
}

const sleep = (ms: number) => new Promise(r => {
  setTimeout(r, ms)
})

export async function listGrantsToRolesFullScan(conn: Connection, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<[ShowRoleGrant[], ShowFutureRoleGrant[], ShowRoleGrantOf[], ShowRole[]]> {
  const showRoles = (await sqlQuery<ShowRole>(conn, 'show roles;', [])).results
  const [batchedRoleNames, numRoles] = await getBatchedRoleNames(showRoles)
  onStart(numRoles)

  await sqlQuery(conn, 'alter session set multi_statement_count = 0;', []) // enable multi statement with batch size

  let roleGrants: ShowRoleGrant[] = []
  let futureRoleGrants: ShowFutureRoleGrant[] = []
  let roleGrantsOf: ShowRoleGrantOf[] = []
  let numRolesQueried = 0

  for (const roleNames of batchedRoleNames) {
    // eslint-disable-next-line no-await-in-loop
    const _roleGrants = await queryRoleGrants(conn, roleNames)
    roleGrants = [...roleGrants, ..._roleGrants]

    // eslint-disable-next-line no-await-in-loop
    const _futureRoleGrants = await queryFutureRoleGrants(conn, roleNames)
    futureRoleGrants = [...futureRoleGrants, ..._futureRoleGrants]

    // eslint-disable-next-line no-await-in-loop
    const _roleGrantsOf = await queryRoleGrantsOf(conn, roleNames)
    roleGrantsOf = [...roleGrantsOf, ..._roleGrantsOf]

    numRolesQueried += roleNames.length
    onProgress(numRolesQueried)

    // eslint-disable-next-line no-await-in-loop
    await sleep(1000)
  }

  return [roleGrants, futureRoleGrants, roleGrantsOf, showRoles]
}

async function queryRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowRoleGrant[]> {
  return queryMulti<ShowRoleGrant>(conn, 'show grants to role identifier(?);', roleNames)
}

async function queryFutureRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowFutureRoleGrant[]> {
  return queryMulti<ShowFutureRoleGrant>(conn, 'show future grants to role identifier(?);', roleNames)
}

async function queryRoleGrantsOf(conn: Connection, roleNames: string[]): Promise<ShowRoleGrantOf[]> {
  return queryMulti<ShowRoleGrantOf>(conn, 'show grants of role identifier(?);', roleNames)
}

async function queryMulti<T>(conn: Connection, query: string, roleNames: string[]): Promise<T[]> {
  const queries: Query[] = roleNames.map(roleName => ([query, [roleName]]))
  const res = await sqlQueries<T>(conn, queries)

  let results: T[] = []
  for (const r of res) {
    results = [...results, ...r.results]
  }

  return results
}

async function getBatchedRoleNames(showRoles: ShowRole[]): Promise<[string[][], number]> {
  const batchSize = 10

  const roleNames = showRoles.map(role => role.name.toLowerCase())

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

const showWarehousesQuery = 'show warehouses;'

export interface Warehouse {
  name: string;
  size: string;
  auto_suspend: number;
}

export async function showWarehouses(conn: Connection): Promise<Warehouse[]> {
  return (await sqlQuery<Warehouse[]>(conn, showWarehousesQuery, [])).results
}

const showObjectsQuery = 'show objects;'

export interface ShowObject {
  name: string;
  database_name: string;
  schema_name: string;
  kind: string;
}

export async function showObjects(conn: Connection): Promise<ShowObject[]> {
  return (await sqlQuery<ShowObject[]>(conn, showObjectsQuery, [])).results
}

const showRolesQuery = 'show roles;'

export async function showRoles(conn: Connection): Promise<ShowRole[]> {
  return (await sqlQuery<ShowRole[]>(conn, showRolesQuery, [])).results
}

const showUsersQuery = 'show users;'

export interface ShowUser {
  name: string;
  login_name: string;
  display_name: string;
  email: string;
}

export async function showUsers(conn: Connection): Promise<ShowUser[]> {
  return (await sqlQuery<ShowUser[]>(conn, showUsersQuery, [])).results
}

export async function executeCommands(accountId: string, queries: Query[], dryRun = false): Promise<AppliedCommand[]> {
  const conn = await getConn(accountId)

  let results: AppliedCommand[] = []

  for (const query of queries) {
    // eslint-disable-next-line no-await-in-loop
    const res = await sqlQuery(conn, query[0], query[1], {dryRun, dontReject: true})

    results = [...results, res]
  }

  return results
}

export interface SqlCommand {
  query: Query;
  entities: Entity[];
}

export interface Entity {
  type: string;
  id: string;
}

export function sqlCommandsFromYamlDiff(yamlDiff: YamlDiff): SqlCommand[] {
  return [
    ...getRoleGrantQueries(yamlDiff.deleted.roleGrants, false),
    ...getUserGrantQueries(yamlDiff.deleted.userGrants, false),
    ...getRolesQueries(yamlDiff.deleted.roles, false),

    ...getRolesQueries(yamlDiff.added.roles, true),
    ...getRoleGrantQueries(yamlDiff.added.roleGrants, true),
    ...getUserGrantQueries(yamlDiff.added.userGrants, true),

    ...getWarehouseQueries(yamlDiff.updated.warehouses),
  ]
}

function getRolesQueries(roles: YamlRoleDefinitions, granted: boolean): SqlCommand[] {
  if (!roles) return []

  const queries: SqlCommand[] = []

  for (const [roleName] of Object.entries(roles)) {
    const query = granted ?
      'create role if not exists identifier(?);' :
      'drop role if exists identifier(?);'

    queries.push({
      query: [query, [roleName]],
      entities: [],
    })
  }

  return queries
}

function getRoleGrantQueries(yamlRoles: YamlRoles, granted: boolean): SqlCommand[] {
  if (!yamlRoles) return []

  const queries: SqlCommand[] = []

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

export function sanitizePrivilege(privilege: string): void {
  if (!(/^[\w ]+$/.test(privilege))) {
    throw new Error('invalid privilege')
  }
}

export function sanitizeObjectType(objectType: string): void {
  if (!(/^[\w ]+$/.test(objectType))) {
    throw new Error('invalid object type')
  }
}

interface NewQueryArgs {
  roleName: string;
  privilege: string;
  objectType: string;
  objectId: string;
  grant: boolean;
}

export function newGrantQuery(roleName: string, privilege: string, objectType: string, objectId: string): SqlCommand {
  return newQuery({roleName, privilege, objectType, objectId, grant: true})
}

export function newRevokeQuery(roleName: string, privilege: string, objectType: string, objectId: string): SqlCommand {
  return newQuery({roleName, privilege, objectType, objectId, grant: false})
}

export function newQuery({roleName, privilege, objectType, objectId, grant}: NewQueryArgs): SqlCommand {
  const grantOrRevoke = grant ? 'grant' : 'revoke'
  const toOrFrom = grant ? 'to' : 'from'

  sanitizePrivilege(privilege)
  sanitizeObjectType(objectType)

  if (privilege === 'usage' && objectType === 'role') {
    return {
      query: [`${grantOrRevoke} role identifier(?) ${toOrFrom} role identifier(?);`, [objectId, roleName]],
      entities: [
        {type: 'role', id: roleName},
        {type: 'role', id: objectId},
      ],
    }
  }

  // extract (db.schema).<(objtype)>
  const futureSchemaRx = /^(\w*\.\w*)\.<(.*)>$/g
  const futureSchemaMatches = futureSchemaRx.exec(objectId)
  if (futureSchemaMatches) {
    const [, schema] = futureSchemaMatches
    return {
      query: [`${grantOrRevoke} ${privilege} on future ${objectType}s in schema identifier(?) ${toOrFrom} role identifier(?);`, [schema, roleName]],
      entities: [
        {type: 'role', id: roleName},
        {type: 'schema', id: schema},
      ],
    }
  }

  // extract (db).<(objtype)>
  const futureDatabaseRx = /^(\w*)\.<(.*)>$/g
  const futureDatabaseMatches = futureDatabaseRx.exec(objectId)
  if (futureDatabaseMatches) {
    const [, database] = futureDatabaseMatches
    return {
      query: [`${grantOrRevoke} ${privilege} on future ${objectType}s in database identifier(?) ${toOrFrom} role identifier(?);`, [database, roleName]],
      entities: [
        {type: 'role', id: roleName},
        {type: 'database', id: database},
      ],
    }
  }

  // extract (db.schema).* (literal "*" not looking for any char)
  const allObjectsInSchemaRx = /^(\w*\.\w*)\.\*$/g
  const allObjectsInSchemaMatches = allObjectsInSchemaRx.exec(objectId)
  if (allObjectsInSchemaMatches) {
    const [, schema] = allObjectsInSchemaMatches
    return {
      query: [`${grantOrRevoke} ${privilege} on all ${objectType}s in schema identifier(?) ${toOrFrom} role identifier(?);`, [schema, roleName]],
      entities: [
        {type: 'role', id: roleName},
        {type: 'schema', id: schema},
      ],
    }
  }

  // extract (db).* (literal "*" not looking for any char)
  const allObjectsInDatabaseRx = /^(\w*)\.\*$/g
  const allObjectsInDatabaseMatches = allObjectsInDatabaseRx.exec(objectId)
  if (allObjectsInDatabaseMatches) {
    const [, database] = allObjectsInDatabaseMatches
    return {
      query: [`${grantOrRevoke} ${privilege} on all ${objectType}s in database identifier(?) ${toOrFrom} role identifier(?);`, [database, roleName]],
      entities: [
        {type: 'role', id: roleName},
        {type: 'database', id: database},
      ],
    }
  }

  return {
    query: [`${grantOrRevoke} ${privilege} on ${objectType} identifier(?) ${toOrFrom} role identifier(?);`, [objectId, roleName]],
    entities: [
      {type: 'role', id: roleName},
      {type: objectType, id: objectId},
    ],
  }
}

function getUserGrantQueries(yamlUserGrants: YamlUserGrants, granted: boolean): SqlCommand[] {
  if (!yamlUserGrants) return []

  const queries: SqlCommand[] = []

  for (const [username, user] of Object.entries(yamlUserGrants)) {
    for (const roleName of user.roles) {
      const query = granted ?
        'grant role identifier(?) to user identifier(?);' :
        'revoke role identifier(?) from user identifier(?);'
      queries.push({
        query: [query, [roleName, username]],
        entities: [
          {type: 'role', id: roleName},
          {type: 'user', id: username},
        ],
      })
    }
  }

  return queries
}

function getWarehouseQueries(yamlWarehouses: YamlWarehouses): SqlCommand[] {
  if (!yamlWarehouses) return []

  const queries: SqlCommand[] = []

  for (const [warehouseName, warehouse] of Object.entries(yamlWarehouses)) {
    if (warehouse?.size) {
      queries.push({
        query: ['alter warehouse identifier(?) set warehouse_size = ?;', [warehouseName, warehouse.size]],
        entities: [
          {type: 'warehouse', id: warehouseName},
        ],
      })
    }
  }

  return queries
}

export function fqObjectId(database: string, schema: string, objectId: string): string {
  return [database.toLowerCase(), schema.toLowerCase(), objectId.toLowerCase()].join('.')
}

export function fqSchemaId(database: string, schema: string): string {
  return [database.toLowerCase(), schema.toLowerCase()].join('.')
}

export function fqDatabaseId(database: string): string {
  return database.toLowerCase()
}
