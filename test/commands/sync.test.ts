import * as spyglass from '../../src/lib/spyglass'
import * as yaml from '../../src/lib/yaml'
import {expect, test} from '@oclif/test'
import {readYamlFile} from '../../src/lib/yaml'

let mockSpyglass = new spyglass.MockSpyglass()
let mockYamlOutput: yaml.Yaml | null = null

const spytest =
  test
  .register('spyglass', () => {
    return {
      run() {
        mockYamlOutput = null
        mockSpyglass = new spyglass.MockSpyglass()
      },
    }
  })

describe('sync', () => {
  spytest
  .stdout()
  .command(['sync'])
  .exit(2)
  .it('requires an argument', ctx => {
    expect(ctx.stdout).to.contain('Missing 1 required arg')
  })

  spytest
  .stdout({print: true})
  .spyglass()
  .do(mockSynctWithFile('./test/testdata/sync-basic-updates.yaml'))
  .stub(spyglass, 'newSpyglass', () => mockSpyglass)
  .stub(yaml, 'readYamlForAccountId', mockReadYamlForAccountId as () => any)
  .stub(yaml, 'writeYamlForAccountId', mockWriteYamlForAccountId as () => any)
  .command(['sync', 'account-123'])
  .exit(0)
  .it('runs sync', ctx => {
    expect(ctx.stdout).to.contain('Fetching current Snowflake configuration')
    expect(ctx.stdout).to.contain('Successfully updated current configuration')
    expect(mockSpyglass._sync).to.deep.equal(mockYamlOutput)
  })

  spytest
  .stdout()
  .spyglass()
  .stub(spyglass, 'newSpyglass', () => mockSpyglass)
  .command(['sync', 'account-doesnt-exist'])
  .exit(1)
  .it('exits on failure', ctx => {
    expect(ctx.stdout).to.contain('file not found')
  })
})

function mockSynctWithFile(filename: string) {
  return async () => {
    mockSpyglass._sync = await readYamlFile(filename)
  }
}

async function mockWriteYamlForAccountId(accountId: string, yaml: yaml.Yaml, _dir = '.'): Promise<void> {
  mockYamlOutput = yaml
}

async function mockReadYamlForAccountId(accountId: string, _dir = '.'): Promise<yaml.Yaml> {
  return readYamlFile('./test/testdata/sync-basic-current.yaml')
}
