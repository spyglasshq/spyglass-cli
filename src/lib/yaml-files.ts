import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {parse, stringify} from 'yaml'
import {exists} from 'fs-extra'
import path = require('node:path')
import {Yaml} from './yaml'

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

export interface DividedYaml {
  [path: string]: any // Should be Yaml after we make more fields optional
}

/**
 * Divides the yaml into groups.
 *
 * @param yaml Yaml to split.
 *
 * @returns void
 * @experimental
 */
export async function divideYaml(yaml: Yaml): Promise<DividedYaml> {
  const res: DividedYaml = {}

  for (const [roleName, roleDef] of Object.entries(yaml.roles)) {
    res[`roles/${roleName}`] = {
      roles: {
        [roleName]: roleDef,
      },
      roleGrants: {
        [roleName]: yaml.roleGrants[roleName],
      },
    }
  }

  for (const [username, userInfo] of Object.entries(yaml.userGrants)) {
    res[`users/${username}`] = {
      userGrants: {
        [username]: userInfo,
      },
    }
  }

  res.spyglass = {
    spyglass: yaml.spyglass,
  }

  return res
}

/**
 * Writes the yaml to files, creating directories along the way.
 *
 * @param dividedYaml Divided yaml to write to files.
 *
 * @returns void
 * @experimental
 */
export async function writeDividedYamlToFiles(dividedYaml: DividedYaml): Promise<void> {
  for (const [name, yaml] of Object.entries(dividedYaml)) {
    const filepath = path.join('./spyglass', `${name}.yaml`)
    const dir = path.dirname(filepath)

    // eslint-disable-next-line no-await-in-loop
    await mkdir(dir, {recursive: true})

    // eslint-disable-next-line no-await-in-loop
    await writeFile(filepath, stringify(yaml, {sortMapEntries: true}))
  }
}
