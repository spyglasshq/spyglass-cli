/* eslint-disable no-await-in-loop */
/* eslint-disable camelcase */
import * as fs from 'fs-extra'
import {readFile, writeFile} from 'node:fs/promises'
import path = require('node:path')
import {Connection, createConnection} from 'snowflake-sdk'
import toml = require('@iarna/toml')
import {YamlDatabaseRoleDefinitions, YamlDiff, YamlRoleDefinitions, YamlRoles, YamlUserGrants, YamlWarehouses} from './yaml'
import {AppliedCommand, Query, SqlCommand, sqlQueries, sqlQuery} from './sql'
import {RateLimiter, WaitGroup} from './ratelimit'

export const AUTHENTICATOR_PASSWORD = 'SNOWFLAKE'
export const SNOWSQL_CONFIG_DIR = path.join(process.env.HOME ?? '', '.snowsql')
export const SNOWSQL_CONFIG_FILE = path.join(SNOWSQL_CONFIG_DIR, 'config')
const SPYGLASS_APPLICATION = 'SpyglassSoftware_Spyglass'

export async function getConnection({accountname, username, password}: ConnectionConfig): Promise<Connection> {
  const conn = createConnection({
    account: accountname ?? '',
    username: username ?? '',
    password,
    authenticator: AUTHENTICATOR_PASSWORD,
    application: SPYGLASS_APPLICATION,
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

const grantsToRolesQuery = 'SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.GRANTS_TO_ROLES WHERE DELETED_ON IS NULL;'

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
  origin: string;
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

  // Collect all standard roles and their grants

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

  // Collect all database roles and their grants

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
  const res = await queryMulti<ShowRoleGrant>(conn, 'SHOW GRANTS TO ROLE IDENTIFIER(?);', roleNames)
  for (const rg of res) {
    rg.grantee_name = normalizeRoleName(rg.grantee_name)
  }

  return res
}

async function queryFutureRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowFutureRoleGrant[]> {
  const res = await queryMulti<ShowFutureRoleGrant>(conn, 'SHOW FUTURE GRANTS TO ROLE IDENTIFIER(?);', roleNames)
  for (const rg of res) {
    rg.grantee_name = normalizeRoleName(rg.grantee_name)
  }

  return res
}

async function queryRoleGrantsOf(conn: Connection, roleNames: string[]): Promise<ShowRoleGrantOf[]> {
  const res = await queryMulti<ShowRoleGrantOf>(conn, 'SHOW GRANTS OF ROLE IDENTIFIER(?);', roleNames)
  for (const role of res) {
    role.role = normalizeRoleName(role.role)
  }

  return res
}

async function getDatabaseRoles(conn: Connection): Promise<[string[], ShowDatabaseRole[]]> {
  const showDatabases = (await sqlQuery<ShowDatabase>(conn, 'SHOW DATABASES;', [])).results as ShowDatabase[]
  // Exclude revoked databases, which we can't query because "Shared database is no longer available for use."
  const databaseNames = showDatabases.filter(db => db.name !== 'SNOWFLAKE' && db.origin !== '<revoked>').map(db => db.name)
  const [batchedDatabaseNames] = getBatchedNames(databaseNames)

  let databaseRoles: ShowDatabaseRole[] = []

  for (const databaseNames of batchedDatabaseNames) {
    const _databaseRoles = await queryDatabaseRoles(conn, databaseNames)
    databaseRoles = [...databaseRoles, ..._databaseRoles]
  }

  return [databaseNames, databaseRoles]
}

async function queryDatabaseRoles(conn: Connection, databaseNames: string[]): Promise<ShowDatabaseRole[]> {
  const res = await queryMultiV2<ShowDatabaseRole>(conn, 'SHOW DATABASE ROLES IN DATABASE IDENTIFIER(?);', databaseNames)

  return res.map(([role, database]) => {
    role.name = normalizeRoleName(role.name)
    role.name = `${database}.${role.name}`
    return role
  })
}

async function queryDatabaseRoleGrants(conn: Connection, roleNames: string[]): Promise<ShowRoleGrant[]> {
  const res = await queryMultiV2<ShowRoleGrant>(conn, 'SHOW GRANTS TO DATABASE ROLE IDENTIFIER(?);', roleNames)

  return res.map(([roleGrant, roleName]) => {
    roleGrant.grantee_name = roleName

    return roleGrant
  })
}

async function queryFutureDatabaseRoleGrants(conn: Connection, databaseNames: string[]): Promise<ShowFutureRoleGrant[]> {
  // There isn't a `show future grants to database role` query, so we have to query for future grants in the database.
  // This returns both database roles and non database roles, so we need to filter out non-database roles later.
  const res = await queryMultiV2<ShowFutureRoleGrant>(conn, 'SHOW FUTURE GRANTS IN DATABASE IDENTIFIER(?);', databaseNames)

  return res
  .map(([roleGrant, database]) => {
    roleGrant.grantee_name = normalizeRoleName(roleGrant.grantee_name)
    roleGrant.grantee_name = `${database}.${roleGrant.grantee_name}`

    return roleGrant
  })
  .filter(rg => rg.grant_to === 'DATABASE_ROLE') // important since 'future grants in database' returns both database role and non database roles
}

async function queryDatabaseRoleGrantsOf(conn: Connection, roleNames: string[]): Promise<ShowRoleGrantOf[]> {
  const res = await queryMultiV2<ShowRoleGrantOf>(conn, 'SHOW GRANTS OF DATABASE ROLE IDENTIFIER(?);', roleNames)

  return res.map(([roleGrant, roleName]) => {
    roleGrant.role = roleName

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

// Start with a letter (A-Z, a-z) or an underscore (“_”).
// Contain only letters, underscores, decimal digits (0-9), and dollar signs (“$”).
// Are stored and resolved as uppercase characters (e.g. id is stored and resolved as ID).

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

  // Otherwise, return as it is (non-double-quoted identifiers are case-insensitive)
  return role
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

const grantsToUsersQuery = 'SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.GRANTS_TO_USERS WHERE DELETED_ON IS NULL;'

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

const showWarehousesQuery = 'SHOW WAREHOUSES;'

export interface Warehouse {
  name: string;
  size: string;
  auto_suspend: number;
}

export async function showWarehouses(conn: Connection): Promise<Warehouse[]> {
  const res = (await sqlQuery<Warehouse[]>(conn, showWarehousesQuery, [])).results as Warehouse[]
  return res
}

const showObjectsQuery = 'SHOW OBJECTS;'

export interface ShowObject {
  name: string;
  database_name: string;
  schema_name: string;
  kind: string;
}

export async function showObjects(conn: Connection): Promise<ShowObject[]> {
  return (await sqlQuery<ShowObject[]>(conn, showObjectsQuery, [])).results
}

const showRolesQuery = 'SHOW ROLES;'

export async function showRoles(conn: Connection): Promise<ShowRole[]> {
  const res = (await sqlQuery<ShowRole[]>(conn, showRolesQuery, [])).results as ShowRole[]
  for (const role of res) {
    role.name = normalizeRoleName(role.name)
  }

  return res
}

const showUsersQuery = 'SHOW USERS;'

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
    const res = await sqlQuery(conn, query[0], query[1], {dryRun, dontReject: true})

    results = [...results, res]
  }

  return results
}

export async function executeSqlCommands(conn: Connection, sqlCommands: SqlCommand[], dryRun = false): Promise<AppliedCommand[]> {
  const rateLimitPerSecond = dryRun ? 0 : 25
  const rl = new RateLimiter(rateLimitPerSecond)
  const wg = new WaitGroup()
  const results: AppliedCommand[] = []

  for (const {query, entities} of sqlCommands) {
    // Increment the wait group *synchronously*, so we can know whether any async work is in-progress.
    wg.add();

    // Run the async work in the background (with no guarantee of when it will actually start).
    (async () => {
      try {
        // Wait for some capacity in the rate limiter.
        await rl.wait()

        const res = await sqlQuery(conn, query[0], query[1], {dryRun, dontReject: true})
        res.entities = entities
        results.push(res)
      } catch (error) {
        console.error(error) // really shouldn't happen, but log just in case.
      } finally {
        // Decrement the wait group, so we know we've finished some async work.
        wg.done()
      }
    })()
  }

  // Wait for all items in the wait group to be "done"
  await wg.wait()

  // Clean up the rate limiter.
  rl.close()

  return results
}

export function sqlCommandsFromYamlDiff(yamlDiff: YamlDiff): SqlCommand[][] {
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
    [
      ...getRoleGrantQueries(yamlDiff.deleted.databaseRoleGrants, false, true),
      ...getRoleGrantQueries(yamlDiff.deleted.roleGrants, false),
      ...getUserGrantQueries(yamlDiff.deleted.userGrants, false),
    ],
    [
      ...getDatabaseRolesQueries(yamlDiff.deleted.databaseRoles, false),
      ...getRolesQueries(yamlDiff.deleted.roles, false),
    ],
    [
      ...getRolesQueries(yamlDiff.added.roles, true),
      ...getDatabaseRolesQueries(yamlDiff.added.databaseRoles, true),
    ],
    [
      ...getRoleGrantQueries(yamlDiff.added.roleGrants, true),
      ...getRoleGrantQueries(yamlDiff.added.databaseRoleGrants, true, true),
      ...getUserGrantQueries(yamlDiff.added.userGrants, true),
    ],
    [
      ...getWarehouseQueries(yamlDiff.updated.warehouses),
    ],
  ]
}

function getRolesQueries(roles: YamlRoleDefinitions | undefined, granted: boolean): SqlCommand[] {
  if (!roles) return []

  const queries: SqlCommand[] = []

  for (const [roleName] of Object.entries(roles)) {
    const query = granted ?
      'CREATE ROLE IF NOT EXISTS IDENTIFIER(?);' :
      'DROP ROLE IF EXISTS IDENTIFIER(?);'

    queries.push({
      query: [query, [roleName]],
      entities: [],
    })
  }

  return queries
}

export function getRoleGrantQueries(yamlRoles?: YamlRoles, granted?: boolean, database?: boolean): SqlCommand[] {
  if (!yamlRoles) return []

  const roleObjPrivs: Record<string, NewQueryBaseArgs> = {}

  for (const [roleName, role] of Object.entries(yamlRoles)) {
    for (const [privilege, objectLists] of Object.entries(role ?? {})) {
      for (const [objectType, objectIds] of Object.entries(objectLists ?? {})) {
        for (const objectId of objectIds ?? []) {
          const key = `${roleName}::${objectType}::${objectId}`
          // eslint-disable-next-line max-depth
          if (!roleObjPrivs[key]) {
            roleObjPrivs[key] = {
              roleName,
              objectType,
              objectId,
              privileges: [],
              database,
            }
          }

          roleObjPrivs[key].privileges.push(privilege)
        }
      }
    }
  }

  const queries: SqlCommand[] = []

  for (const args of Object.values(roleObjPrivs)) {
    const query = granted ? newGrantQuery(args) : newRevokeQuery(args)
    queries.push(query)
  }

  return queries
}

export function sanitizePrivileges(...privileges: string[]): void {
  for (const privilege of privileges) {
    if (!/^[\w .]+$/.test(privilege)) {
      throw new Error('invalid privilege')
    }
  }
}

export function sanitizeObjectType(objectType: string): void {
  if (!(/^[\w ]+$/.test(objectType))) {
    throw new Error('invalid object type')
  }
}

export function queryifyObjectType(objectType: string): string {
  // Seems like objectType from Snowflake `SHOW GRANTS` queries includes an underscore ('_')
  // But when we write a GRANT or REVOKE query, we don't want the underscore.
  // List of objects: https://docs.snowflake.com/en/sql-reference/sql/show
  return objectType.replace(/_/g, ' ')
}

interface NewQueryBaseArgs {
  roleName: string;
  privileges: string[];
  objectType: string;
  objectId: string;
  database?: boolean;
}

interface NewQueryArgs extends NewQueryBaseArgs {
  grant: boolean;
}

export function newGrantQuery(args: NewQueryBaseArgs): SqlCommand {
  return newQuery({grant: true, ...args})
}

export function newRevokeQuery(args: NewQueryBaseArgs): SqlCommand {
  return newQuery({grant: false, ...args})
}

export function newQuery({roleName, privileges, objectType: objType, objectId, grant, database}: NewQueryArgs): SqlCommand {
  const action = grant ? 'create' : 'delete'
  const grantOrRevoke = grant ? 'GRANT' : 'REVOKE'
  const toOrFrom = grant ? 'TO' : 'FROM'
  const roleOrDatabaseRole = database ? 'DATABASE ROLE' : 'ROLE'

  sanitizePrivileges(...privileges)
  sanitizeObjectType(objType)

  const objectType = queryifyObjectType(objType)

  if (privileges.length === 1 && privileges[0] === 'USAGE' && (objectType === 'ROLE' || objectType === 'DATABASE ROLE')) {
    return {
      query: [`${grantOrRevoke} ${objectType} IDENTIFIER(?) ${toOrFrom} ${roleOrDatabaseRole} IDENTIFIER(?);`, [objectId, roleName]],
      entities: [
        {type: roleOrDatabaseRole, id: roleName, action},
        {type: objectType, id: objectId, action},
      ],
    }
  }

  const privs = privSql(privileges)

  // extract (db.schema).<(objtype)>
  const futureSchemaRx = /^(\w*\.\w*)\.<(.*)>$/g
  const futureSchemaMatches = futureSchemaRx.exec(objectId)
  if (futureSchemaMatches) {
    const [, schema] = futureSchemaMatches
    return {
      query: [`${grantOrRevoke} ${privs} ON FUTURE ${objectType}S IN SCHEMA IDENTIFIER(?) ${toOrFrom} ${roleOrDatabaseRole} IDENTIFIER(?);`, [schema, roleName]],
      entities: [
        {type: roleOrDatabaseRole, id: roleName, action},
        {type: 'SCHEMA', id: schema, action},
      ],
    }
  }

  // extract (db).<(objtype)>
  const futureDatabaseRx = /^(\w*)\.<(.*)>$/g
  const futureDatabaseMatches = futureDatabaseRx.exec(objectId)
  if (futureDatabaseMatches) {
    const [, database] = futureDatabaseMatches
    return {
      query: [`${grantOrRevoke} ${privs} ON FUTURE ${objectType}S IN DATABASE IDENTIFIER(?) ${toOrFrom} ${roleOrDatabaseRole} IDENTIFIER(?);`, [database, roleName]],
      entities: [
        {type: roleOrDatabaseRole, id: roleName, action},
        {type: 'DATABASE', id: database, action},
      ],
    }
  }

  // extract (db.schema).* (literal "*" not looking for any char)
  const allObjectsInSchemaRx = /^(\w*\.\w*)\.\*$/g
  const allObjectsInSchemaMatches = allObjectsInSchemaRx.exec(objectId)
  if (allObjectsInSchemaMatches) {
    const [, schema] = allObjectsInSchemaMatches
    return {
      query: [`${grantOrRevoke} ${privs} ON ALL ${objectType}S IN SCHEMA IDENTIFIER(?) ${toOrFrom} ${roleOrDatabaseRole} IDENTIFIER(?);`, [schema, roleName]],
      entities: [
        {type: roleOrDatabaseRole, id: roleName, action},
        {type: 'SCHEMA', id: schema, action},
      ],
    }
  }

  // extract (db).* (literal "*" not looking for any char)
  const allObjectsInDatabaseRx = /^(\w*)\.\*$/g
  const allObjectsInDatabaseMatches = allObjectsInDatabaseRx.exec(objectId)
  if (allObjectsInDatabaseMatches) {
    const [, database] = allObjectsInDatabaseMatches
    return {
      query: [`${grantOrRevoke} ${privs} ON ALL ${objectType}S IN DATABASE IDENTIFIER(?) ${toOrFrom} ${roleOrDatabaseRole} IDENTIFIER(?);`, [database, roleName]],
      entities: [
        {type: roleOrDatabaseRole, id: roleName, action},
        {type: 'DATABASE', id: database, action},
      ],
    }
  }

  return {
    query: [`${grantOrRevoke} ${privs} ON ${objectType} IDENTIFIER(?) ${toOrFrom} ${roleOrDatabaseRole} IDENTIFIER(?);`, [objectId, roleName]],
    entities: [
      {type: roleOrDatabaseRole, id: roleName, action},
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
        'GRANT ROLE IDENTIFIER(?) TO USER IDENTIFIER(?);' :
        'REVOKE ROLE IDENTIFIER(?) FROM USER IDENTIFIER(?);'
      queries.push({
        query: [query, [roleName, username]],
        entities: [
          {type: 'ROLE', id: roleName},
          {type: 'USER', id: username},
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
        query: ['ALTER WAREHOUSE IDENTIFIER(?) SET WAREHOUSE_SIZE = ?;', [warehouseName, warehouse.size]],
        entities: [
          {type: 'WAREHOUSE', id: warehouseName},
        ],
      })
    }
  }

  return queries
}

export function fqObjectId(database: string, schema: string, objectId: string): string {
  return [database, schema, objectId].join('.')
}

export function fqSchemaId(database: string, schema: string): string {
  return [database, schema].join('.')
}

export function fqDatabaseId(database: string): string {
  return database
}

function getDatabaseRolesQueries(roles: YamlDatabaseRoleDefinitions | undefined, granted: boolean): SqlCommand[] {
  if (!roles) return []

  const queries: SqlCommand[] = []

  for (const [roleName] of Object.entries(roles)) {
    const query = granted ?
      'CREATE DATABASE ROLE IF NOT EXISTS IDENTIFIER(?);' :
      'DROP DATABASE ROLE IF EXISTS IDENTIFIER(?);'

    queries.push({
      query: [query, [roleName]],
      entities: [],
    })
  }

  return queries
}

function privSql(privileges: string[]): string {
  return privileges.join(',')
}
