import {readFile, writeFile} from 'node:fs/promises'
import {parse, stringify} from 'yaml'
import {deeplyConvertSetsToStringLists, deeplyConvertStringListsToSets, deeplySortLists, replaceUndefinedValuesWithDeletedValues} from './difftools'
import {RoleGrant, UserGrant, Warehouse} from './snowflake'
import {detailedDiff} from 'deep-object-diff'
import { exists } from 'fs-extra'

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

export interface YamlRole {
  [privilege: string]: {
    [objectType: string]: ObjectId[];
  };
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

export async function readYamlForAccountId(accountId: string): Promise<Yaml> {
  const singleYamlFilename = `${accountId}.yaml`

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

export async function writeYamlForAccountId(accountId: string, yaml: Yaml): Promise<void> {
  const singleYamlFilename = `${accountId}.yaml`
  // HACK: doesn't yet support multi file
  return writeYamlFile(singleYamlFilename, yaml)
}

export async function writeYamlFile(filename: string, yaml: Yaml): Promise<void> {
  await writeFile(filename, stringify(yaml, {sortMapEntries: true}))
}

export function yamlFromRoleGrants(accountId: string, roleGrantsRows: RoleGrant[], userGrantsRows: UserGrant[], warehousesRows: Warehouse[]): Yaml {
  const roleGrants = rolesYamlFromRoleGrants(roleGrantsRows)
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

export function rolesYamlFromRoleGrants(rows: RoleGrant[]): YamlRoles {
  const roleGrants: YamlRoles = {}

  for (const rg of rows) {
    if (['ACCOUNTADMIN', 'SECURITYADMIN', 'USERADMIN', 'ORGADMIN', 'SYSADMIN', 'PC_SPYGLASS_ROLE'].includes(rg.GRANTEE_NAME)) {
      continue
    }

    if (rg.GRANTED_TO !== 'ROLE') {
      continue
    }

    const grantee = rg.GRANTEE_NAME.toLowerCase()
    const privilege = rg.PRIVILEGE.toLowerCase()
    const grantedObjectType = rg.GRANTED_ON.toLowerCase()

    let name = rg.NAME
    if (rg.TABLE_CATALOG && rg.TABLE_SCHEMA && rg.NAME === rg.TABLE_SCHEMA) {
      name = fqSchemaId(rg.TABLE_CATALOG, rg.TABLE_SCHEMA)
    } else if (rg.TABLE_CATALOG && rg.TABLE_SCHEMA && rg.NAME) {
      name = fqObjectId(rg.TABLE_CATALOG, rg.TABLE_SCHEMA, rg.NAME)
    }

    name = name.toLowerCase()

    if (!roleGrants[grantee]) {
      roleGrants[grantee] = {}
    }

    if (!roleGrants[grantee][privilege]) {
      roleGrants[grantee][privilege] = {}
    }

    if (!roleGrants[grantee][privilege][grantedObjectType]) {
      roleGrants[grantee][privilege][grantedObjectType] = []
    }

    roleGrants[grantee][privilege][grantedObjectType].push(name)
  }

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

function fqSchemaId(database: string, schema: string): string {
  return [database, schema].join('.')
}

function fqObjectId(database: string, schema: string, objectName: string): string {
  return [database, schema, objectName].join('.')
}
