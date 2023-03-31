/**
 * The `yaml` module contains the main configuration language for Spyglass.
 *
 * The primary interface `Yaml` is the object that is serialized and deserialized
 * to yaml files, forming the basis of this library's config-as-code implementation.
 *
 * ### Basic Example
 *
 * A simple example of a yaml file looks like:
 *
 * ```yaml
roleGrants:
  acme_prod_all_tables_viewer:
    select:
      table:
        - acme.prod.<table>
      view:
        - acme.prod.<view>
        - acme.prod.call_center
        - acme.prod.catalog_page
        - acme.prod.catalog_returns
        - acme.prod.catalog_sales
    usage:
      database:
        - acme
      schema:
        - acme.prod
spyglass:
  accountId: account-123
  lastSyncedMs: 1678883775793
  platform: snowflake
  version: 1
userGrants:
  charles_stevens:
    roles:
      - acme_prod_all_tables_viewer
 * ```
 *
 * ### Special Operators
 *
 * As seen above, you can use `database.schema.<future>` to create a "future grants" statement,
 * such as `acme.prod.<future>` to grant access to all future views.
 *
 * Additionally, you can use `database.schema.*` to create an "all grants" statement, such as
 * `acme.prod.*` to grant access to all current views.
 *
 * ### Goals
 *
 * One main design goal of this yaml is to be **isomorphic**; that is, a reversible mapping between
 * Spyglass configuration and databases like Snowflake.
 *
 * So, you can `import` Snowflake access rules to Spyglass, as well as `apply` Spyglass configuration
 * back into Snowflake access rules, at any time.
 * @module yaml
 */

import {readFile, writeFile} from 'node:fs/promises'
import {parse, stringify} from 'yaml'
import {deeplyConvertSetsToStringLists, deeplyConvertStringListsToSets, deeplySortLists, replaceUndefinedValuesWithDeletedValues} from './difftools'
import {ShowFutureRoleGrant, ShowRole, ShowRoleGrant, ShowRoleGrantOf, Warehouse} from './snowflake'
import {detailedDiff} from 'deep-object-diff'
import {exists} from 'fs-extra'
import path = require('node:path')

export const PRIVILEGES = ['apply', 'apply masking policy', 'apply row access policy', 'apply tag', 'audit', 'create account', 'create credential', 'create data exchange listing', 'create failover group', 'create integration', 'create replication group', 'create role', 'create share', 'execute alert', 'execute managed task', 'execute task', 'import share', 'manage account support cases', 'manage user support cases', 'monitor', 'monitor execution', 'monitor security', 'monitor usage', 'override share restrictions', 'ownership', 'purchase data exchange listing', 'reference_usage', 'select', 'usage', 'insert'] as const
export type Privilege = typeof PRIVILEGES[number]

const EXCLUDED_ROLES = new Set(['ACCOUNTADMIN', 'SECURITYADMIN', 'USERADMIN', 'ORGADMIN', 'SYSADMIN', 'PC_SPYGLASS_ROLE'])

export type Platform = 'snowflake' | 'unspecified';

/**
 * A fully-qualified object id.
 *
 * For objects like tables and views, this must be of the form <database>.<schema>.<object>
 *
 * Example: "acme.prod.payments"
 */
export type ObjectId = string;

/**
 * Yaml is the primary interface for Spyglass configuration. It is serialized
 * and deserialized to yaml files.
 */
export interface Yaml {
  /**
   * Spyglass-specific configuration.
   */
  spyglass: YamlSpyglass;

  /**
   * A list of roles and the privileges they are granted.
   */
  roleGrants: YamlRoles;

  /**
   * A list of users and the roles they are granted.
   */
  userGrants: YamlUserGrants;

  /**
   * A list of roles and their definitions.
   */
  roles: YamlRoleDefinitions;

  /** A list of warehouses and their configuration
   * @experimental
   */
  warehouses: YamlWarehouses;
}

/**
 * Spyglass-specific configuration.
 *
 * Standard defaults are generated when `import` is invoked the first time.
 */
export interface YamlSpyglass {
  /**
   * Account id of the form "org_id-account_id" (e.g. "zhjgixi-tv26532")
   */
  accountId: string;

  /**
   * Platform name (e.g. "snowflake")
   */
  platform: Platform;

  /**
   * Yaml protocol version (e.g. 1)
   */
  version: number;

  /**
   * Updated automatically on calls to `sync`.
   */
  lastSyncedMs: number;

  /**
   * If true, then future `sync` calls will replace large lists of tables/views with a wildcard ("*"),
   * based on whether all tables in a schema or database have been granted.
   */
  compressRecords?: boolean;
}

/**
 * A map keyed by `role` name, and the values are the privileges granted to the role.
 *
 * Updating this list will result in `grant <privilege>` and `revoke <privilege>` queries being executed.
 */
export interface YamlRoles {
  [role: string]: YamlRole;
}

export type YamlRole = {
  /**
   * A map of privileges (e.g. "select", "usage") to objects.
   */
  [privilege in Privilege]?: CurrentYamlRole;
}

export interface CurrentYamlRole {
  /**
   * A map of object types to object ids.
   *
   * Object type is a Snowflake object like "table" or "view".
   *
   * Object id is a fully-qualified object id (see docs for ObjectId).
   */
  [objectType: string]: ObjectId[];
}

export interface YamlWarehouses {
  [warehouse: string]: YamlWarehouse;
}

/**
 * A warehouse. Experimental feature.
 *
 * Currently, updates only result in `alter warehouse` queries when the `size` property is updated.
 */
export interface YamlWarehouse {
  /**
   * Name of the warehouse.
   */
  name: string;

  /**
   * Warehouse size (e.g. "X-Small")
   */
  size: string;

  // eslint-disable-next-line camelcase
  auto_suspend: number;
}

/**
 * A map keyed by `username`, and the values are the role grants of each user.
 *
 * Updating this list will result in `grant role` and `revoke role` queries being executed.
 */
export interface YamlUserGrants {
  [username: string]: YamlUserGrant;
}

export interface YamlUserGrant {
  /**
   * A list of roles granted to the user.
   */
  roles: string[];
}

/**
 * Role definitions.
 *
 * Updating this list will result in `create role` or `drop role` queries being executed.
 */
export interface YamlRoleDefinitions {
  [role: string]: YamlRoleDefinition;
}

export interface YamlRoleDefinition {
  name?: string;
  comment?: string;
}

export interface YamlDiff {
  added: Yaml;
  deleted: Yaml;
  updated: Yaml;
}

export async function readYamlForAccountId(accountId: string, dir = '.'): Promise<Yaml> {
  const singleYamlFilename = path.join(dir, `${accountId}.yaml`)

  if (await exists(singleYamlFilename)) {
    return readYamlFile(singleYamlFilename)
  }

  throw new Error(`file not found: ${singleYamlFilename}`)
}

export async function readYamlFile(filename: string): Promise<Yaml> {
  const file = await readFile(filename)
  const contents = parse(file.toString())
  return contents
}

export async function parseYamlFile(contents: string): Promise<Yaml> {
  return parse(contents)
}

export async function writeYamlForAccountId(accountId: string, yaml: Yaml, dir = '.'): Promise<void> {
  const singleYamlFilename = path.join(dir, `${accountId}.yaml`)
  // HACK: doesn't yet support multi file
  return writeYamlFile(singleYamlFilename, yaml)
}

export async function writeYamlFile(filename: string, yaml: Yaml): Promise<void> {
  await writeFile(filename, stringify(yaml, {sortMapEntries: true}))
}

// eslint-disable-next-line max-params
export function yamlFromRoleGrants(accountId: string, roleGrantsRows: ShowRoleGrant[], futureRoleGrants: ShowFutureRoleGrant[], roleGrantsOf: ShowRoleGrantOf[], warehousesRows: Warehouse[], rolesRows: ShowRole[]): Yaml {
  const roleGrants = rolesYamlFromRoleGrants(roleGrantsRows, futureRoleGrants)
  const userGrants = usersYamlFromUserGrants(roleGrantsOf)
  const warehouses = warehousesYamlFromWarehouses(warehousesRows)
  const roles = rolesYamlFromRoles(rolesRows)

  const yaml: Yaml = {
    spyglass: {
      version: 1,
      platform: 'snowflake',
      accountId,
      lastSyncedMs: Date.now(),
    },
    roleGrants,
    userGrants,
    warehouses,
    roles,
  }

  deeplySortLists(yaml)

  return yaml
}

export function usersYamlFromUserGrants(rows: ShowRoleGrantOf[]): YamlUserGrants {
  const userGrants: YamlUserGrants = {}

  for (const rg of rows) {
    if (rg.granted_to !== 'USER') {
      continue
    }

    const role = rg.role.toLowerCase()
    const username = rg.grantee_name.toLowerCase()

    if (!userGrants[username]) {
      userGrants[username] = {
        roles: [],
      }
    }

    userGrants[username].roles.push(role)
  }

  return userGrants
}

export function rolesYamlFromRoleGrants(rows: ShowRoleGrant[], futureRoleGrants: ShowFutureRoleGrant[]): YamlRoles {
  const roleGrants: YamlRoles = {}

  for (const rg of rows) {
    if (EXCLUDED_ROLES.has(rg.grantee_name)) {
      continue
    }

    const grantee = rg.grantee_name.toLowerCase()
    const privilege = rg.privilege.toLowerCase() as Privilege
    const grantedObjectType = rg.granted_on.toLowerCase()
    const name = rg.name.toLowerCase()

    const role = roleGrants[grantee] ?? {}
    roleGrants[grantee] = role

    const privileges = role[privilege] ?? {}
    role[privilege] = privileges

    const objectLists = privileges[grantedObjectType] ?? []
    privileges[grantedObjectType] = objectLists

    objectLists.push(name)
  }

  for (const rg of futureRoleGrants) {
    if (EXCLUDED_ROLES.has(rg.grantee_name)) {
      continue
    }

    const grantee = rg.grantee_name.toLowerCase()
    const privilege = rg.privilege.toLowerCase() as Privilege
    const grantObjectType = rg.grant_on.toLowerCase()
    const name = rg.name.toLowerCase().replace(/<.*>/, '<future>')

    const role = roleGrants[grantee] ?? {}
    roleGrants[grantee] = role

    const privileges = role[privilege] ?? {}
    role[privilege] = privileges

    const objectLists = privileges[grantObjectType] ?? []
    privileges[grantObjectType] = objectLists

    objectLists.push(name)
  }

  deeplyConvertStringListsToSets(roleGrants)
  deeplyConvertSetsToStringLists(roleGrants)

  return roleGrants
}

export function warehousesYamlFromWarehouses(rows: Warehouse[]): YamlWarehouses {
  const res: YamlWarehouses = {}

  for (const wh of rows) {
    const name = wh.name.toLowerCase()
    res[name] = {
      name,
      // eslint-disable-next-line camelcase
      auto_suspend: wh.auto_suspend,
      size: wh.size,
    }
  }

  return res
}

function rolesYamlFromRoles(rolesRows: ShowRole[]): YamlRoleDefinitions {
  const res: YamlRoleDefinitions = {}

  for (const row of rolesRows) {
    const name = row.name.toLowerCase()
    res[name] = {}
  }

  return res
}

export function diffYaml(current: Yaml, proposed: Yaml): YamlDiff {
  // Convert lists ["role1", "role2"] to objects, which are easier to diff (ignores order)
  deeplyConvertStringListsToSets(current)
  deeplyConvertStringListsToSets(proposed)

  const {added, deleted, updated} = detailedDiff(current, proposed) as { added: Yaml, deleted: Yaml, updated: Yaml }

  // Deleted objects show up as undefined, so we have to cross-reference to the current values
  // to see what was actually deleted.
  replaceUndefinedValuesWithDeletedValues(deleted, current)

  // Convert objects back to lists.
  deeplyConvertSetsToStringLists(added)
  deeplyConvertSetsToStringLists(deleted)

  return {added, deleted, updated}
}

export function validateYaml(yaml: Yaml): string[] {
  let issues: string[] = []

  if (yaml) {
    issues = []
  }

  return issues
}
