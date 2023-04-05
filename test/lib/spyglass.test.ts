/* eslint-disable camelcase */
import * as spyglass from '../../src/lib/spyglass'
import * as snowflake from '../../src/lib/snowflake'
import * as issues from '../../src/lib/issues'
import {expect, test} from '@oclif/test'
import {readJSON} from 'fs-extra'
import {Yaml, YamlRoleDefinitions} from '../../src/lib/yaml'
import {readYamlFile} from '../../src/lib/yaml-files'

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

  describe('findNotExistingEntities', () => {
    it('basic empty test', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = []
      const users: snowflake.ShowUser[] = []
      const sqlCommands: snowflake.SqlCommand[] = []

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(0)
    })

    it('finds databases that do and don\'t exist', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = [
        {name: 'order_history', database_name: 'acme', schema_name: 'prod', kind: 'table'},
      ]
      const users: snowflake.ShowUser[] = []
      const sqlCommands: snowflake.SqlCommand[] = [
        newSqlCommandWithEntities({type: 'database', id: 'acme', action: 'create'}),
        newSqlCommandWithEntities({type: 'database', id: 'doesnt_exist', action: 'create'}),
      ]

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(1)
      expect(missingEntities[0]).to.deep.equal({type: 'database', id: 'doesnt_exist', action: 'create'})
    })

    it('finds schemas that do and don\'t exist', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = [
        {name: 'order_history', database_name: 'acme', schema_name: 'prod', kind: 'table'},
      ]
      const users: snowflake.ShowUser[] = []
      const sqlCommands: snowflake.SqlCommand[] = [
        newSqlCommandWithEntities({type: 'database', id: 'acme', action: 'create'}),
        newSqlCommandWithEntities({type: 'schema', id: 'acme.prod', action: 'create'}),
        newSqlCommandWithEntities({type: 'schema', id: 'acme.doesnt_exist', action: 'create'}),
      ]

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(1)
      expect(missingEntities[0]).to.deep.equal({type: 'schema', id: 'acme.doesnt_exist', action: 'create'})
    })

    it('finds tables that do and don\'t exist', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = [
        {name: 'order_history', database_name: 'acme', schema_name: 'prod', kind: 'table'},
        {name: 'payment_history', database_name: 'acme', schema_name: 'prod', kind: 'table'},
      ]
      const users: snowflake.ShowUser[] = []
      const sqlCommands: snowflake.SqlCommand[] = [
        newSqlCommandWithEntities({type: 'database', id: 'acme', action: 'create'}),
        newSqlCommandWithEntities({type: 'schema', id: 'acme.prod', action: 'create'}),
        newSqlCommandWithEntities({type: 'table', id: 'acme.prod.order_history', action: 'create'}),
        newSqlCommandWithEntities({type: 'table', id: 'acme.prod.doesnt_exist', action: 'create'}),
      ]

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(1)
      expect(missingEntities[0]).to.deep.equal({type: 'table', id: 'acme.prod.doesnt_exist', action: 'create'})
    })

    it('skips objects that don\'t exist if permissions are being revoked', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = [
        {name: 'order_history', database_name: 'acme', schema_name: 'prod', kind: 'table'},
        {name: 'payment_history', database_name: 'acme', schema_name: 'prod', kind: 'table'},
      ]
      const users: snowflake.ShowUser[] = []
      const sqlCommands: snowflake.SqlCommand[] = [
        newSqlCommandWithEntities({type: 'table', id: 'acme.prod.order_history', action: 'create'}),
        newSqlCommandWithEntities({type: 'table', id: 'acme.prod.doesnt_exist', action: 'delete'}),
      ]

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(0)
    })
  })
})

function newSqlCommandWithEntities(e: snowflake.Entity): snowflake.SqlCommand {
  return {
    query: ['some query;', []],
    entities: [e],
  }
}
