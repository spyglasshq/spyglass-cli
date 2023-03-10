import {readFile, writeFile} from 'node:fs/promises'
import {parse, stringify} from 'yaml'
import {deeplyConvertSetsToStringLists, deeplyConvertStringListsToSets, deeplySortLists, replaceUndefinedValuesWithDeletedValues} from './difftools'
import {ShowFutureRoleGrant, ShowRoleGrant, UserGrant, Warehouse} from './snowflake'
import {detailedDiff} from 'deep-object-diff'
import {exists} from 'fs-extra'
import path = require('node:path')

export const PRIVILEGES = ['usage', 'select', 'insert', 'update', 'delete', 'monitor'] as const
export type Privilege = typeof PRIVILEGES[number]

const EXCLUDED_ROLES = new Set(['ACCOUNTADMIN', 'SECURITYADMIN', 'USERADMIN', 'ORGADMIN', 'SYSADMIN', 'PC_SPYGLASS_ROLE'])

export type Platform = 'snowflake' | 'unspecified';
export type ObjectId = string;

export interface Yaml {
  spyglass: YamlSpyglass;
  roleGrants: YamlRoles;
  userGrants: YamlUserGrants;
  warehouses: YamlWarehouses;
}

export interface YamlSpyglass {
  accountId: string;
  platform: Platform;
  version: number;
  lastSyncedMs: number;
}

export interface YamlRoles {
  [role: string]: YamlRole;
}

export interface YamlRole extends YamlRoleBase {
  future?: YamlFutureRole;
}

export type YamlRoleBase = {
  [privilege in Privilege]: CurrentYamlRole;
}

export interface CurrentYamlRole {
  [objectType: string]: ObjectId[];
}

export interface YamlFutureRole {
  [privilege: string]: string[];
}

export interface YamlWarehouses {
  [warehouse: string]: YamlWarehouse;
}

export interface YamlWarehouse {
  name: string;
  size: string;
  // eslint-disable-next-line camelcase
  auto_suspend: number;
}

export interface YamlUserGrants {
  [username: string]: YamlUserGrant;
}

export interface YamlUserGrant {
  roles: string[];
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
export function yamlFromRoleGrants(accountId: string, roleGrantsRows: ShowRoleGrant[], futureRoleGrants: ShowFutureRoleGrant[], userGrantsRows: UserGrant[], warehousesRows: Warehouse[]): Yaml {
  const roleGrants = rolesYamlFromRoleGrants(roleGrantsRows, futureRoleGrants)
  const userGrants = usersYamlFromUserGrants(userGrantsRows)
  const warehouses = warehousesYamlFromWarehouses(warehousesRows)

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
  }

  deeplySortLists(yaml)

  return yaml
}

export function usersYamlFromUserGrants(rows: UserGrant[]): YamlUserGrants {
  const userGrants: YamlUserGrants = {}

  for (const rg of rows) {
    if (rg.GRANTED_TO !== 'USER') {
      continue
    }

    const role = rg.ROLE.toLowerCase()
    const username = rg.GRANTEE_NAME.toLowerCase()

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
    const privilege = rg.privilege.toLowerCase()
    const grantObjectType = rg.grant_on.toLowerCase()

    const role = roleGrants[grantee] ?? {}
    roleGrants[grantee] = role

    const privileges = role.future ?? {}
    role.future = privileges

    const objectTypes = privileges[privilege] ?? []
    privileges[privilege] = objectTypes

    objectTypes.push(grantObjectType)
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
