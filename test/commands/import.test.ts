import * as spyglass from '../../src/lib/spyglass'
import * as yaml from '../../src/lib/yaml'
import * as yamlFiles from '../../src/lib/yaml-files'
import {expect, test} from '@oclif/test'
import {readYamlFile} from '../../src/lib/yaml-files'

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

describe('import', () => {
  spytest
  .stdout()
  .command(['import'])
  .exit(2)
  .it('requires an argument', ctx => {
    expect(ctx.stdout).to.contain('Missing 1 required arg')
  })

  spytest
  .stdout({print: true})
  .spyglass()
  .do(mockImportWithFile('./test/testdata/import-basic.yaml'))
  .stub(spyglass, 'newSpyglass', () => mockSpyglass)
  .stub(yamlFiles, 'writeYamlForAccountId', mockWriteYamlForAccountId as () => any)
  .command(['import', 'account-123'])
  .exit(0)
  .it('runs import', ctx => {
    expect(ctx.stdout).to.contain('Fetching current Snowflake configuration')
    expect(ctx.stdout).to.contain('Successfully wrote current configuration')
    expect(mockSpyglass._import).to.deep.equal(mockYamlOutput)
  })

  spytest
  .stdout()
  .spyglass()
  .do(() => {
    mockSpyglass._error = new Error('failed')
  })
  .stub(spyglass, 'newSpyglass', () => mockSpyglass)
  .command(['import', 'account-123'])
  .exit(1)
  .it('exits on failure', ctx => {
    expect(ctx.stdout).to.contain('Fetching current Snowflake configuration')
    expect(ctx.stdout).to.contain('Encountered an error: failed')
  })
})

function mockImportWithFile(filename: string) {
  return async () => {
    mockSpyglass._import = await readYamlFile(filename)
  }
}

async function mockWriteYamlForAccountId(accountId: string, yaml: yaml.Yaml, _dir = '.'): Promise<void> {
  mockYamlOutput = yaml
}
