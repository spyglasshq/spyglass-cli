import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from '@oclif/test'
import {assert} from 'chai'
import {ExitError} from '@oclif/core/lib/errors'
import * as git from 'isomorphic-git'

import AccountsList from '../src/commands/accounts/list'
import Import from '../src/commands/import'
import Apply from '../src/commands/apply'
import {readYamlForAccountId, writeYamlForAccountId} from '../src/lib/yaml-files'

process.env.NODE_ENV = 'integration-test'

interface TestState {
  accountId: string;
  dir: string;
  gitBranch: string;
}

describe('basic flow', () => {
  const tt: TestState = {
    accountId: '',
    dir: '.',
    gitBranch: `integration-test-${Date.now()}`,
  }

  it('lists authenticated accounts', async () => {
    const accounts = (await AccountsList.run()) as {accountId: string}[]
    expect(accounts).to.have.length(1)

    const {accountId} = accounts[0]
    expect(accountId).to.be.a.string
    expect(accountId).to.have.length.greaterThan(0)
    tt.accountId = accountId
  })

  it('imports snowflake config', async () => {
    await expectSuccess(Import.run([tt.accountId, '--dir', tt.dir]))
    assert.isOk(fs.existsSync(`${tt.dir}/${tt.accountId}.yaml`))
  })

  it('applies dry run', async () => {
    // first, remove a privilege that exists and then commit to a new branch
    const yaml = await readYamlForAccountId(tt.accountId, tt.dir)

    let role = ''
    let database = ''

    for (const [roleName, roleInfo] of Object.entries(yaml.roleGrants)) {
      if ((roleInfo.usage?.database?.length ?? 0) > 0) {
        role = roleName
        database = roleInfo.usage!.database.pop() as string
      }
    }

    await writeYamlForAccountId(tt.accountId, yaml, tt.dir)
    await createAndCheckoutBranch(tt.gitBranch)
    const sha = await addAndCommitFile(`${tt.dir}/${tt.accountId}.yaml`)

    // add back the privilege that already exists
    yaml.roleGrants[role].usage!.database.push(database)
    await writeYamlForAccountId(tt.accountId, yaml, tt.dir)

    // apply against the branch
    await expectSuccess(Apply.run([tt.accountId, '--confirm', '--dir', tt.dir, '--git-ref', sha]))

    // add: dry run first and ensure output has 'grant usage on database acme to role sales_engineering;'
  })

  after(async () => {
    await checkoutBranch('master')
    await deleteBranch(tt.gitBranch)
    await fs.promises.rm(`${tt.dir}/${tt.accountId}.yaml`)
  })
})

async function expectSuccess(promise: Promise<unknown>): Promise<any> {
  try {
    await promise
  } catch (error: any) {
    const err = error as ExitError
    expect(err.code).to.equal('EEXIT')
    expect(err.oclif.exit).to.equal(0)
  }
}

async function gitRoot(): Promise<string> {
  return git.findRoot({
    fs,
    filepath: path.resolve('.'),
  })
}

async function createAndCheckoutBranch(ref: string): Promise<void> {
  await git.branch({
    fs,
    dir: await gitRoot(),
    ref,
    checkout: true,
  })
}

async function checkoutBranch(ref: string): Promise<void> {
  await git.checkout({
    fs,
    dir: await gitRoot(),
    ref,
  })
}

async function addAndCommitFile(filepath: string): Promise<string> {
  await git.add({
    fs,
    dir: await gitRoot(),
    filepath,
    force: true,
  })

  return git.commit({
    fs,
    dir: await gitRoot(),
    author: {
      name: 'integration-test',
      email: 'devs@spyglass.software',
    },
    message: 'Committing imported yaml for integration test.',
  })
}

async function deleteBranch(ref: string): Promise<void> {
  await git.deleteBranch({
    fs,
    dir: await gitRoot(),
    ref,
  })
}
