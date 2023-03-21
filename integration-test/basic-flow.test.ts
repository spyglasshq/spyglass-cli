import * as fs from 'node:fs'
import {expect} from '@oclif/test'
import {assert} from 'chai'
import {ExitError} from '@oclif/core/lib/errors'

import AccountsList from '../src/commands/accounts/list'
import Import from '../src/commands/import'

process.env.NODE_ENV = 'integration-test'

interface TestState {
  accountId: string;
}

describe('basic flow', () => {
  const tt: TestState = {
    accountId: '',
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
    await expectSuccess(Import.run([tt.accountId, '--dir', 'tmp']))
    const filename = `./tmp/${tt.accountId}.yaml`
    assert.isOk(fs.existsSync(filename))
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
