import git = require('isomorphic-git')
import fs = require('fs')
import path = require('path')

export async function readFileAtBranch(filepath: string, branch: string): Promise<string> {
  const gitRoot = await git.findRoot({
    fs,
    filepath: path.resolve('.'),
  })

  const commitOid = await git.resolveRef({fs, dir: gitRoot, ref: branch})

  const {blob} = await git.readBlob({
    fs,
    dir: gitRoot,
    oid: commitOid,
    filepath: path.relative(gitRoot, filepath),
  })

  return Buffer.from(blob).toString('utf8')
}
