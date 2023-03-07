import git = require('isomorphic-git')
import fs = require('fs')
import path = require('path')
import {parseYamlFile, Yaml} from './yaml'

export async function readFileAtBranch(filepath: string, ref: string): Promise<string> {
  const gitRoot = await git.findRoot({
    fs,
    filepath: path.resolve('.'),
  })

  const commitOid = await git.resolveRef({fs, dir: gitRoot, ref})

  const {blob} = await git.readBlob({
    fs,
    dir: gitRoot,
    oid: commitOid,
    filepath: path.relative(gitRoot, filepath),
  })

  return Buffer.from(blob).toString('utf8')
}

export async function readYamlAtBranch(accountId: string, ref: string): Promise<Yaml> {
  // HACK: doesn't yet support multi file
  const contents = await readFileAtBranch(accountId + '.yaml', ref)
  return parseYamlFile(contents)
}
