/* eslint-disable camelcase */
import * as spyglass from '../../src/lib/spyglass'
import * as snowflake from '../../src/lib/snowflake'
import * as issues from '../../src/lib/issues'
import {expect, test} from '@oclif/test'
import {readJSON} from 'fs-extra'
import {readYamlFile, Yaml} from '../../src/lib/yaml'

const noopFunc = () => null // progress bar no op

describe('SnowflakeSpyglass', () => {
  const spyg = new spyglass.SnowflakeSpyglass()

  let currentYaml: Yaml
  describe('import', () => {
    test
    .stub(snowflake, 'getConn', () => null)
    .stub(snowflake, 'listGrantsToRolesFullScan', () => readJSON('test/testdata/spyglass-import-snowflake-stub-basic.json'))
    .stub(snowflake, 'showWarehouses', () => ([]))
    .stub(Date, 'now', () => 1)
    .it('succeeds', async () => {
      const yaml = await spyg.import({accountId: 'account-123', onStart: noopFunc, onProgress: noopFunc})

      expect(yaml.roleGrants).to.deep.equal({
        acme_prod_call_center_reader: {
          select: {
            view: ['acme.prod.call_center'],
          },
          usage: {
            database: ['acme'],
            schema: ['acme.prod'],
          },
        },
        acme_prod_all_tables_viewer: {
          select: {
            table: ['acme.prod.<future>'],
          },
        },
        customer_support: {
          usage: {
            role: ['acme_prod_call_center_reader'],
          },
        },
      })

      expect(yaml.userGrants).to.deep.equal({
        chuck_support: {
          roles: ['customer_support'],
        },
        alice_admin: {
          roles: ['acme_prod_all_tables_viewer'],
        },
      })

      expect(yaml.roles).to.deep.equal({
        acme_prod_all_tables_viewer: {},
        acme_prod_call_center_reader: {},
        customer_support: {},
      })

      currentYaml = yaml
    })
  })

  describe('sync', () => {
    test
    .stub(snowflake, 'getConn', () => null)
    .stub(snowflake, 'listGrantsToRolesFullScan', () => readJSON('test/testdata/spyglass-sync-snowflake-stub-basic.json'))
    .stub(snowflake, 'showWarehouses', () => ([]))
    .stub(Date, 'now', () => 2)
    .it('succeeds', async () => {
      const oldSpyglass = JSON.parse(JSON.stringify(currentYaml.spyglass))

      const updatedYaml = await spyg.sync({yaml: currentYaml, onStart: noopFunc, onProgress: noopFunc})

      expect(updatedYaml.spyglass.version).to.equal(oldSpyglass.version)
      expect(updatedYaml.spyglass.platform).to.equal(oldSpyglass.platform)
      expect(updatedYaml.spyglass.accountId).to.equal(oldSpyglass.accountId)
      expect(updatedYaml.spyglass.lastSyncedMs).to.not.equal(oldSpyglass.lastSyncedMs)

      expect(updatedYaml.roleGrants).to.deep.equal({
        acme_prod_all_tables_viewer: {
          select: {
            table: ['acme.prod.<future>'],
          },
        },
      })

      expect(updatedYaml.userGrants).to.deep.equal({
        alice_admin: {
          roles: ['acme_prod_all_tables_viewer'],
        },
      })

      expect(updatedYaml.roles).to.deep.equal({
        acme_prod_all_tables_viewer: {},
      })
    })
  })

  const mockIssues: issues.Issue[] = [issues.newSR1001({role: 'acme_user', database: 'acme'})]
  mockIssues[0].id = 'issue-123'
  describe('verify', () => {
    test
    .stub(issues, 'findIssues', () => mockIssues)
    .it('returns a list of issues when no arg is passed', async () => {
      const yaml = await readJSON('test/testdata/spyglass-import-snowflake-stub-basic.json')
      const issues = await spyg.verify(yaml)
      expect(issues).to.deep.equal(mockIssues)
    })

    test
    .it('returns details when an arg is passed', async () => {
      const yaml = await readYamlFile('test/testdata/issues-SR1001.yaml')
      const issue = (await spyg.verify(yaml, 'fbf1af0675dc')) as issues.IssueDetail

      expect(issue.yamlDiff.added.roleGrants.acme_prod_all_tables_viewer?.usage?.database).to.deep.equal(['acme'])
      expect(issue.yamlDiff.deleted).to.be.empty
      expect(issue.yamlDiff.updated).to.be.empty
    })
  })
})
