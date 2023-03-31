import {readFile, writeFile} from 'node:fs/promises'
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
