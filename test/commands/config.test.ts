import {expect, test} from '@oclif/test'
import * as config from '../../src/lib/config'
import * as fs from 'fs-extra'

const mockJson: config.Config = {
  analyticsId: 'abcdefg',
  disableAnalytics: false,
}

describe('config', () => {
  test
  .stdout({print: true})
  .stub(fs, 'readJSON', () => mockJson)
  .command(['config:get'])
  .exit(0)
  .it('gets current config', ctx => {
    expect(ctx.stdout).to.contain('analyticsId: abcdefg')
    expect(ctx.stdout).to.contain('disableAnalytics: false')
  })

  test
  .stdout({print: true})
  .stub(fs, 'readJSON', throwFileNotFoundError as any)
  .command(['config:get'])
  .exit(0)
  .it('generates new config when file doesnt exist', ctx => {
    expect(ctx.stdout).to.contain('analyticsId: ')
  })

  test
  .stdout({print: true})
  .stub(fs, 'readJSON', () => mockJson)
  .command(['config:get', 'analyticsId'])
  .exit(0)
  .it('gets a specific value', ctx => {
    expect(ctx.stdout).to.contain('analyticsId: abcdefg')
    expect(ctx.stdout).to.not.contain('disableAnalytics: false')
  })
})

function throwFileNotFoundError() {
  const err = new Error('not found') as any
  err.code = 'ENOENT'
  throw err
}
