import git = require('isomorphic-git')
import fs = require('fs')
import path = require('path')
import {Yaml} from './yaml'
import {parseYamlFile} from './yaml-files'

export async function readFileAtBranch(filepath: string, ref: string, dir = '.'): Promise<string> {
  const gitRoot = await git.findRoot({
    fs,
    filepath: path.resolve(dir),
  })

  const commitOid = await git.resolveRef({fs, dir: gitRoot, ref})

  const {blob} = await git.readBlob({
    fs,
    dir: gitRoot,
    oid: commitOid,
    filepath: path.relative(gitRoot, path.join(dir, filepath)),
  })

  return Buffer.from(blob).toString('utf8')
}

export async function readYamlAtBranch(accountId: string, ref: string, dir = '.'): Promise<Yaml> {
  // HACK: doesn't yet support multi file
  const contents = await readFileAtBranch(accountId + '.yaml', ref, dir)
  return parseYamlFile(contents)
}
