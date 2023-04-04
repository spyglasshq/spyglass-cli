import {readFile, writeFile, readdir} from 'node:fs/promises'
import {parse, stringify} from 'yaml'
import {exists} from 'fs-extra'
import path = require('node:path')
import {Yaml} from './yaml'
import {mergeDeep} from './obj-merge'

export async function readYamlForAccountId(accountId: string, dir = '.'): Promise<Yaml> {
  const singleYamlFilename = path.join(dir, `${accountId}.yaml`)

  if (await exists(singleYamlFilename)) {
    return readYamlFile(singleYamlFilename)
  }

  const files = (await getFiles(dir)).filter(file => file.toLowerCase().endsWith('.yml') || file.toLowerCase().endsWith('.yaml'))

  if (files.length === 0) {
    throw new Error(`yaml not found for account id: ${accountId}`)
  }

  const dividedYamls = await Promise.all(files.map(file => readYamlFile(file)))

  let yaml = {}
  for (const dividedYaml of dividedYamls) {
    yaml = mergeDeep(yaml, dividedYaml)
  }

  return yaml as Yaml
}

export async function getFiles(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, {withFileTypes: true})
  const files = await Promise.all(dirents.map(dirent => {
    const res = path.resolve(dir, dirent.name)
    return (dirent.isDirectory() ? getFiles(res) : res) as string
  }))

  return files.flat()
}

export async function readYamlFile(filename: string): Promise<Yaml> {
  const file = await readFile(filename)
  const contents = parse(file.toString())
  return contents
}

export async function parseYamlFile(contents: string): Promise<Yaml> {
  return parse(contents)
}

export async function updateYamlForAccountId(accountId: string, yaml: Yaml, dir = '.'): Promise<void> {
  const singleYamlFilename = path.join(dir, `${accountId}.yaml`)

  if (await exists(singleYamlFilename)) {
    return writeYamlFile(singleYamlFilename, yaml)
  }

  const files = (await getFiles(dir)).filter(file => file.toLowerCase().endsWith('.yml') || file.toLowerCase().endsWith('.yaml'))
  const dividedYamls = await Promise.all(files.map(file => readYamlFile(file)))

  for (const dividedYaml of dividedYamls) {
    for (const [roleName] of Object.entries(dividedYaml.roleGrants ?? {})) {
      dividedYaml.roleGrants[roleName] = yaml.roleGrants[roleName]
      delete yaml.roleGrants[roleName]
    }

    for (const [username] of Object.entries(dividedYaml.userGrants ?? {})) {
      dividedYaml.userGrants[username] = yaml.userGrants[username]
      delete yaml.userGrants[username]
    }

    for (const [roleName] of Object.entries(dividedYaml.roles ?? {})) {
      dividedYaml.roles[roleName] = yaml.roles[roleName]
      delete yaml.roles[roleName]
    }

    if (dividedYaml.spyglass) {
      dividedYaml.spyglass = yaml.spyglass
      delete (yaml as any).spyglass
    }
  }

  if (Object.keys(yaml.roleGrants ?? {}).length === 0) {
    delete (yaml as any).roleGrants
  }

  if (Object.keys(yaml.userGrants ?? {}).length === 0) {
    delete (yaml as any).userGrants
  }

  if (Object.keys(yaml.roles ?? {}).length === 0) {
    delete (yaml as any).roles
  }

  await Promise.all(files.map((file, i) => writeYamlFile(file, dividedYamls[i])))
  await writeYamlFile(path.join(dir, 'uncategorized.yaml'), yaml)
}

export async function writeYamlForAccountId(accountId: string, yaml: Yaml, dir = '.'): Promise<void> {
  const singleYamlFilename = path.join(dir, `${accountId}.yaml`)
  return writeYamlFile(singleYamlFilename, yaml)
}

export async function writeYamlFile(filename: string, yaml: Yaml): Promise<void> {
  await writeFile(filename, stringify(yaml, {sortMapEntries: true}))
}
