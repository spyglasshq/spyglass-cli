import {readFile, writeFile} from 'node:fs/promises'
import {parse, stringify} from 'yaml'

export type Platform = 'snowflake' | 'unspecified';
export type ObjectId = string;

export interface Yaml {
  spyglass: YamlSpyglass;
  roles: YamlRoles;
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

export interface YamlDiff {
  added: YamlRoles;
  deleted: YamlRoles
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
