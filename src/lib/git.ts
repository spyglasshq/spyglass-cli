import git = require('isomorphic-git')
import fs = require('fs')

export async function readFileAtBranch(filepath: string, branch: string): Promise<string> {
  const commitOid = await git.resolveRef({fs, dir: '.', ref: branch})

  const {blob} = await git.readBlob({
    fs,
    dir: '.',
    oid: commitOid,
    filepath: filepath,
  })

  return Buffer.from(blob).toString('utf8')
}
