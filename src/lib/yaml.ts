import {readFile, writeFile} from 'node:fs/promises'
import {parse, stringify} from 'yaml'

export type Platform = 'snowflake' | 'unspecified';

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
  view?: string[];
  inherits?: string[];
}

export async function readYamlFile(filename: string): Promise<Yaml> {
  const file = await readFile(filename)
  const contents = parse(file.toString())
  return contents
}

export async function writeYamlFile(filename: string, yaml: Yaml): Promise<void> {
  await writeFile(filename, stringify(yaml, {sortMapEntries: true}))
}
