import {expect, test} from '@oclif/test'

describe('import', () => {
  test
  .stdout()
  .command(['import'])
  .exit(2)
  .it('requires an argument', ctx => {
    expect(ctx.stdout).to.contain('Missing 1 required arg')
  })

  test
  .stdout({print: true})
  .command(['import', 'account-123'])
  .exit(0)
  .it('runs import', ctx => {
    expect(ctx.stdout).to.contain('Fetching current Snowflake configuration')
  })
})
