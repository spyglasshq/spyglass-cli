import {expect, test} from '@oclif/test'
import * as config from '../../src/lib/config'
import * as fs from 'fs-extra'

const mockJson: config.Config = {
  analyticsId: 'abcdefg',
  disableAnalytics: false,
}

describe('config', () => {
  describe('config:get', () => {
    test
    .stdout()
    .stub(fs, 'readJSON', () => mockJson)
    .command(['config:get'])
    .exit(0)
    .it('gets current config', ctx => {
      expect(ctx.stdout).to.contain('analyticsId: abcdefg')
      expect(ctx.stdout).to.contain('disableAnalytics: false')
    })

    test
    .stdout()
    .stub(fs, 'readJSON', throwFileNotFoundError as any)
    .command(['config:get'])
    .exit(0)
    .it('generates new config when file doesnt exist', ctx => {
      expect(ctx.stdout).to.contain('analyticsId: ')
    })

    test
    .stdout()
    .stub(fs, 'readJSON', () => mockJson)
    .command(['config:get', 'analyticsId'])
    .exit(0)
    .it('gets a specific value', ctx => {
      expect(ctx.stdout).to.contain('analyticsId: abcdefg')
      expect(ctx.stdout).to.not.contain('disableAnalytics: false')
    })

    test
    .stdout()
    .env({SNOWSQL_CONFIG: '<contents>'})
    .stub(fs, 'readJSON', throwFileNotFoundError as any)
    .command(['config:get', 'analyticsId'])
    .exit(0)
    .it('generates a deterministic analyticsId if env var is set', ctx => {
      expect(ctx.stdout).to.contain('analyticsId: e442027550a956d560eb477ce3f812d6')
    })
  })

  describe('config:set', () => {
    test
    .stdout()
    .stub(fs, 'readJSON', () => mockJson)
    .command(['config:set'])
    .exit(2)
    .it('set requires two args', ctx => {
      expect(ctx.stdout).to.contain('Missing 2 required args')
    })

    let updatedJson: config.Config
    test
    .stdout()
    .stub(fs, 'readJSON', () => mockJson)
    .stub(fs, 'writeJSON', ((_filepath: string, cfg: config.Config) => {
      updatedJson = cfg
    }) as any)
    .command(['config:set', 'disableAnalytics', 'true'])
    .exit(0)
    .it('sets boolean vars', _ctx => {
      expect(updatedJson.disableAnalytics).to.be.true
    })

    test
    .stdout()
    .stub(fs, 'readJSON', () => mockJson)
    .stub(fs, 'writeJSON', ((_filepath: string, cfg: config.Config) => {
      updatedJson = cfg
    }) as any)
    .command(['config:set', 'disableAnalytics', '1'])
    .exit(0)
    .it('sets boolean vars', _ctx => {
      expect(updatedJson.disableAnalytics).to.be.true
    })

    test
    .stdout()
    .stub(fs, 'readJSON', () => mockJson)
    .stub(fs, 'writeJSON', ((_filepath: string, cfg: config.Config) => {
      updatedJson = cfg
    }) as any)
    .command(['config:set', 'analyticsId', 'fakeid'])
    .exit(0)
    .it('sets string vars', _ctx => {
      expect(updatedJson.analyticsId).to.equal('fakeid')
    })

    test
    .stdout()
    .stub(fs, 'readJSON', throwFileNotFoundError as any)
    .stub(fs, 'writeJSON', ((_filepath: string, cfg: config.Config) => {
      updatedJson = cfg
    }) as any)
    .command(['config:set', 'disableAnalytics', '1'])
    .exit(0)
    .it('generates new config when file doesnt exist', _ctx => {
      expect(updatedJson.disableAnalytics).to.be.true
      expect(updatedJson.analyticsId).to.have.length.greaterThan(0)
    })
  })
})

function throwFileNotFoundError() {
  const err = new Error('not found') as any
  err.code = 'ENOENT'
  throw err
}
