import {readFile, writeFile} from 'node:fs/promises'
import {parse, stringify} from 'yaml'

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

export async function readYamlFile(filename: string): Promise<Yaml> {
  const file = await readFile(filename)
  const contents = parse(file.toString())
  return contents
}

export async function parseYamlFile(contents: string): Promise<Yaml> {
  return parse(contents)
}

export async function writeYamlFile(filename: string, yaml: Yaml): Promise<void> {
  await writeFile(filename, stringify(yaml, {sortMapEntries: true}))
}
