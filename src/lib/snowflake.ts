/* eslint-disable no-await-in-loop */
/* eslint-disable camelcase */
import * as fs from 'fs-extra'
import {readFile, writeFile} from 'node:fs/promises'
import path = require('node:path')
import {Connection, createConnection} from 'snowflake-sdk'
import toml = require('@iarna/toml')
import {PRIVILEGES, YamlDiff, YamlRoleDefinitions, YamlRoles, YamlUserGrants, YamlWarehouses} from './yaml'
import {AppliedCommand, Query, SqlCommand, sqlQueries, sqlQuery} from './sql'

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

export async function getConn(_accountId: string): Promise<Connection> {
  const accountId = _accountId.toLowerCase()
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

export interface ShowDatabase {
  created_on: Date;
  name: string;
  // ... more fields
}

export interface ShowDatabaseRole {
  created_on: Date;
  name: string;
  is_default: boolean;
  is_current: boolean;
  is_inherited: boolean;
  granted_to_roles: number;
  granted_to_database_roles: number;
  granted_database_roles: number;
  owner: string;
  comment: string;
  owner_role_type: string;
}

export interface DatabaseRoleName {
  database: string;
  role: string;
}

const sleep = (ms: number) => new Promise(r => {
  setTimeout(r, ms)
})

export interface ListGrantsToRolesFullScanResult {
  roleGrants: ShowRoleGrant[]
  futureRoleGrants: ShowFutureRoleGrant[]
  roleGrantsOf: ShowRoleGrantOf[]
  roles: ShowRole[]
  databaseRoles: ShowDatabaseRole[]
  databaseFutureRoleGrants: ShowFutureRoleGrant[]
  databaseRoleGrants: ShowRoleGrant[]
  databaseRoleGrantsOf: ShowRoleGrantOf[]
}

export async function listGrantsToRolesFullScan(conn: Connection, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<ListGrantsToRolesFullScanResult> {
  const roles = await showRoles(conn)
  const roleNames = roles.map(role => role.name)
  const [batchedRoleNames, numRoles] = getBatchedNames(roleNames)

  const [databaseNames, databaseRoles] = await getDatabaseRoles(conn)
  const databaseRoleNames = databaseRoles.map(role => role.name)
  const [batchedDatabaseRoleNames, numDatabaseRoles] = getBatchedNames(databaseRoleNames)
  const [batchedDatabaseNames, numDatabaseNames] = getBatchedNames(databaseNames)

  onStart(numRoles + numDatabaseRoles + numDatabaseNames)

  let roleGrants: ShowRoleGrant[] = []
  let futureRoleGrants: ShowFutureRoleGrant[] = []
  let roleGrantsOf: ShowRoleGrantOf[] = []
  let numRolesQueried = 0

  for (const roleNames of batchedRoleNames) {
    const _roleGrants = await queryRoleGrants(conn, roleNames)
    roleGrants = [...roleGrants, ..._roleGrants]

    const _futureRoleGrants = await queryFutureRoleGrants(conn, roleNames)
    futureRoleGrants = [...futureRoleGrants, ..._futureRoleGrants]

    const _roleGrantsOf = await queryRoleGrantsOf(conn, roleNames)
    roleGrantsOf = [...roleGrantsOf, ..._roleGrantsOf]

    numRolesQueried += roleNames.length
    onProgress(numRolesQueried)

    await sleep(1000)
  }

  let databaseRoleGrants: ShowRoleGrant[] = []
  let databaseFutureRoleGrants: ShowFutureRoleGrant[] = []
  let databaseRoleGrantsOf: ShowRoleGrantOf[] = []

  for (const databaseNames of batchedDatabaseNames) {
    const _futureRoleGrants = await queryFutureDatabaseRoleGrants(conn, databaseNames)
    databaseFutureRoleGrants = [...databaseFutureRoleGrants, ..._futureRoleGrants]
  }

  for (const roleNames of batchedDatabaseRoleNames) {
    const _roleGrants = await queryDatabaseRoleGrants(conn, roleNames)
    databaseRoleGrants = [...databaseRoleGrants, ..._roleGrants]

    const _roleGrantsOf = await queryDatabaseRoleGrantsOf(conn, roleNames)
    databaseRoleGrantsOf = [...databaseRoleGrantsOf, ..._roleGrantsOf]

    numRolesQueried += roleNames.length
    onProgress(numRolesQueried)

    await sleep(1000)
  }

  return {roleGrants, futureRoleGrants, roleGrantsOf, roles, databaseRoles, databaseRoleGrants, databaseFutureRoleGrants, databaseRoleGrantsOf}
}

async function queryRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowRoleGrant[]> {
  const res = await queryMulti<ShowRoleGrant>(conn, 'show grants to role identifier(?);', roleNames)
  for (const rg of res) {
    rg.grantee_name = normalizeRoleName(rg.grantee_name)
    rg.privilege = rg.privilege.toLowerCase()
    rg.granted_on = rg.granted_on.toLowerCase()
    rg.name = rg.name.toLowerCase()
  }

  return res
}

async function queryFutureRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowFutureRoleGrant[]> {
  const res = await queryMulti<ShowFutureRoleGrant>(conn, 'show future grants to role identifier(?);', roleNames)
  for (const rg of res) {
    rg.grantee_name = normalizeRoleName(rg.grantee_name)
    rg.privilege = rg.privilege.toLowerCase()
    rg.grant_on = rg.grant_on.toLowerCase()
    rg.name = rg.name.toLowerCase()
  }

  return res
}

async function queryRoleGrantsOf(conn: Connection, roleNames: string[]): Promise<ShowRoleGrantOf[]> {
  const res = await queryMulti<ShowRoleGrantOf>(conn, 'show grants of role identifier(?);', roleNames)
  for (const role of res) {
    role.role = normalizeRoleName(role.role)
    role.grantee_name = role.grantee_name.toLowerCase()
  }

  return res
}

async function getDatabaseRoles(conn: Connection): Promise<[string[], ShowDatabaseRole[]]> {
  const showDatabases = (await sqlQuery<ShowDatabase>(conn, 'show databases;', [])).results as ShowDatabase[]
  const databaseNames = showDatabases.map(db => db.name.toLowerCase()).filter(db => db !== 'snowflake')
  const [batchedDatabaseNames] = getBatchedNames(databaseNames)

  let databaseRoles: ShowDatabaseRole[] = []

  for (const databaseNames of batchedDatabaseNames) {
    const _databaseRoles = await queryDatabaseRoles(conn, databaseNames)
    databaseRoles = [...databaseRoles, ..._databaseRoles]
  }

  return [databaseNames, databaseRoles]
}

async function queryDatabaseRoles(conn: Connection, databaseNames: string[]): Promise<ShowDatabaseRole[]> {
  const res = await queryMultiV2<ShowDatabaseRole>(conn, 'show database roles in database identifier(?);', databaseNames)

  return res.map(([role, database]) => {
    role.name = normalizeRoleName(role.name)
    role.name = `${database}.${role.name}`
    return role
  })
}

async function queryDatabaseRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowRoleGrant[]> {
  const res = await queryMultiV2<ShowRoleGrant>(conn, 'show grants to database role identifier(?);', roleNames)

  return res.map(([roleGrant, roleName]) => {
    roleGrant.grantee_name = roleName
    roleGrant.privilege = roleGrant.privilege.toLowerCase()
    roleGrant.granted_on = roleGrant.granted_on.toLowerCase()
    roleGrant.name = roleGrant.name.toLowerCase()

    return roleGrant
  })
}

async function queryFutureDatabaseRoleGrants(conn: Connection, databaseNames: string[]): Promise<ShowFutureRoleGrant[]> {
  const res = await queryMultiV2<ShowFutureRoleGrant>(conn, 'show future grants in database identifier(?);', databaseNames)

  return res.map(([roleGrant, database]) => {
    roleGrant.grantee_name = normalizeRoleName(roleGrant.grantee_name)
    roleGrant.grantee_name = `${database}.${roleGrant.grantee_name}`
    roleGrant.privilege = roleGrant.privilege.toLowerCase()
    roleGrant.grant_on = roleGrant.grant_on.toLowerCase()
    roleGrant.name = roleGrant.name.toLowerCase()

    return roleGrant
  })
}

async function queryDatabaseRoleGrantsOf(conn: Connection, roleNames: string[]): Promise<ShowRoleGrantOf[]> {
  const res = await queryMultiV2<ShowRoleGrantOf>(conn, 'show grants of database role identifier(?);', roleNames)

  return res.map(([roleGrant, roleName]) => {
    roleGrant.role = roleName
    roleGrant.grantee_name = roleGrant.grantee_name.toLowerCase()

    return roleGrant
  })
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

type MultiRes<T> = [t: T, param: string]

async function queryMultiV2<T>(conn: Connection, query: string, params: string[]): Promise<MultiRes<T>[]> {
  const queries: Query[] = params.map(param => ([query, [param]]))
  const res = await sqlQueries<T>(conn, queries)

  const results: MultiRes<T>[] = []
  for (const [i, r] of res.entries()) {
    for (const result of r.results) {
      results.push([result as T, params[i]])
    }
  }

  return results
}

export function normalizeRoleName(role: string): string {
  // Support double-quoted identifiers (case-sensitive, allows special characters)
  // https://docs.snowflake.com/en/sql-reference/identifiers-syntax

  // In truth, the response from `show roles;` doesn't tell us whether this is a double-quoted identifier.
  // As a heuristic, we look for special characters, and assume it's a double-quoted identifier if so.
  //
  // So, if someone is using double-quotes just for case sensitivity (e.g. "mY_RolE"), we won't catch
  // that.
  if (role.match(/[\s!#$%&'*.@^-]/g)?.length) {
    // if it's already double-quoted, don't double-quote it again
    if (role.startsWith('"') && role.endsWith('"')) {
      return role
    }

    // otherwise, wrap it in quotes
    return `"${role}"`
  }

  // Otherwise, normalize to all-lower case (non-double-quoted identifiers are case-insensitive)
  return role.toLowerCase()
}

function getBatchedNames(names: string[]): [string[][], number] {
  const batchSize = 10

  const batchedRoleNames: string[][] = []

  let batchIndex = 0
  for (const name of names) {
    if (batchedRoleNames[batchIndex]?.length >= batchSize) {
      batchIndex++
    }

    if (!batchedRoleNames[batchIndex]) {
      batchedRoleNames[batchIndex] = []
    }

    batchedRoleNames[batchIndex] = [...batchedRoleNames[batchIndex], name]
  }

  return [batchedRoleNames, names.length]
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
  const res = (await sqlQuery<Warehouse[]>(conn, showWarehousesQuery, [])).results as Warehouse[]
  for (const wh of res) {
    wh.name = wh.name.toLowerCase()
  }

  return res
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
  const res = (await sqlQuery<ShowRole[]>(conn, showRolesQuery, [])).results as ShowRole[]
  for (const role of res) {
    role.name = normalizeRoleName(role.name)
  }

  return res
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

// Deprecated. Use executeSqlCommands() instead.
export async function executeCommands(conn: Connection, queries: Query[], dryRun = false): Promise<AppliedCommand[]> {
  let results: AppliedCommand[] = []

  for (const query of queries) {
    // eslint-disable-next-line no-await-in-loop
    const res = await sqlQuery(conn, query[0], query[1], {dryRun, dontReject: true})

    results = [...results, res]
  }

  return results
}

export async function executeSqlCommands(conn: Connection, sqlCommands: SqlCommand[], dryRun = false): Promise<AppliedCommand[]> {
  let results: AppliedCommand[] = []

  for (const {query, entities} of sqlCommands) {
    // eslint-disable-next-line no-await-in-loop
    const res = await sqlQuery(conn, query[0], query[1], {dryRun, dontReject: true})
    res.entities = entities

    results = [...results, res]
  }

  return results
}

export function sqlCommandsFromYamlDiff(yamlDiff: YamlDiff): SqlCommand[] {
  // When generating SQL commands, we must be careful about ordering.
  //
  // For example, a role needs to exist in order for it to be granted. So
  // we must create the role before granting it. On the other side, we should
  // delete grants before deleting the role itself. (In the case of Snowflake,
  // grants are deleted when you delete a role, but that's not a guarantee we
  // can rely on in the general case).
  //
  // Deletes occur before creates for a reason, but I can't recall off the top
  // of my head as of this writing.
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

function getRolesQueries(roles: YamlRoleDefinitions | undefined, granted: boolean): SqlCommand[] {
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
  const action = grant ? 'create' : 'delete'
  const grantOrRevoke = grant ? 'grant' : 'revoke'
  const toOrFrom = grant ? 'to' : 'from'

  sanitizePrivilege(privilege)
  sanitizeObjectType(objectType)

  if (privilege === 'usage' && objectType === 'role') {
    return {
      query: [`${grantOrRevoke} role identifier(?) ${toOrFrom} role identifier(?);`, [objectId, roleName]],
      entities: [
        {type: 'role', id: roleName, action},
        {type: 'role', id: objectId, action},
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
        {type: 'role', id: roleName, action},
        {type: 'schema', id: schema, action},
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
        {type: 'role', id: roleName, action},
        {type: 'database', id: database, action},
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
        {type: 'role', id: roleName, action},
        {type: 'schema', id: schema, action},
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
        {type: 'role', id: roleName, action},
        {type: 'database', id: database, action},
      ],
    }
  }

  return {
    query: [`${grantOrRevoke} ${privilege} on ${objectType} identifier(?) ${toOrFrom} role identifier(?);`, [objectId, roleName]],
    entities: [
      {type: 'role', id: roleName, action},
      {type: objectType, id: objectId, action},
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
