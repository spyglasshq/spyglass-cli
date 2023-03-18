import * as spyglass from '../../src/lib/spyglass'
import * as yaml from '../../src/lib/yaml'
import {expect, test} from '@oclif/test'

let mockSpyglass = new spyglass.MockSpyglass()

const spytest =
  test
  .register('spyglass', () => {
    return {
      run() {
        mockSpyglass = new spyglass.MockSpyglass()
      },
    }
  })

describe('verify', () => {
  spytest
  .stdout()
  .command(['verify'])
  .exit(2)
  .it('requires an argument', ctx => {
    expect(ctx.stdout).to.contain('Missing 1 required arg')
  })

  spytest
  .stub(spyglass, 'newSpyglass', () => mockSpyglass)
  .stub(yaml, 'readYamlForAccountId', mockReadYamlForAccountId as () => any)
  .do(mockVerify())
  .stdout()
  .command(['verify', 'account-123'])
  .exit(0)
  .it('runs', ctx => {
    expect(ctx.stdout).to.contain('verify')
  })
})

function mockVerify() {
  return async () => {
    mockSpyglass._verify = []
  }
}

async function mockReadYamlForAccountId(accountId: string, _dir = '.'): Promise<yaml.Yaml> {
  return yaml.readYamlFile('./test/testdata/sync-basic-current.yaml')
}
