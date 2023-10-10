/* eslint-disable camelcase */
import * as spyglass from '../../src/lib/spyglass'
import * as snowflake from '../../src/lib/snowflake'
import * as issues from '../../src/lib/issues'
import {expect, test} from '@oclif/test'
import {readJSON} from 'fs-extra'
import {Yaml, YamlRoleDefinitions} from '../../src/lib/yaml'
import {readYamlFile} from '../../src/lib/yaml-files'
import {Entity, SqlCommand} from '../../src/lib/sql'

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
        ACME_PROD_CALL_CENTER_READER: {
          SELECT: {
            VIEW: ['ACME.PROD.CALL_CENTER'],
          },
          USAGE: {
            DATABASE: ['ACME'],
            SCHEMA: ['ACME.PROD'],
          },
        },
        ACME_PROD_ALL_TABLES_VIEWER: {
          SELECT: {
            TABLE: ['ACME.PROD.<FUTURE>'],
          },
        },
        CUSTOMER_SUPPORT: {
          USAGE: {
            ROLE: ['ACME_PROD_CALL_CENTER_READER'],
          },
        },
      })

      expect(yaml.userGrants).to.deep.equal({
        CHUCK_SUPPORT: {
          roles: ['CUSTOMER_SUPPORT'],
        },
        ALICE_ADMIN: {
          roles: ['"Snowflake - Admins"', 'ACME_PROD_ALL_TABLES_VIEWER'],
        },
      })

      expect(yaml.roles).to.deep.equal({
        ACME_PROD_ALL_TABLES_VIEWER: {},
        ACME_PROD_CALL_CENTER_READER: {},
        CUSTOMER_SUPPORT: {},
        '"Snowflake - Admins"': {},
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
        ACME_PROD_ALL_TABLES_VIEWER: {
          SELECT: {
            TABLE: ['ACME.PROD.<FUTURE>'],
          },
        },
      })

      expect(updatedYaml.userGrants).to.deep.equal({
        ALICE_ADMIN: {
          roles: ['ACME_PROD_ALL_TABLES_VIEWER'],
        },
      })

      expect(updatedYaml.roles).to.deep.equal({
        ACME_PROD_ALL_TABLES_VIEWER: {},
      })
    })
  })

  const mockIssues: issues.Issue[] = [issues.newSR1001({role: 'ACME_USER', database: 'ACME'})]
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
      const issue = (await spyg.verify(yaml, '4492bb31ea09')) as issues.IssueDetail

      expect(issue.yamlDiff.added.roleGrants.ACME_PROD_ALL_TABLES_VIEWER?.USAGE?.DATABASE).to.deep.equal(['ACME'])
      expect(issue.yamlDiff.deleted).to.be.empty
      expect(issue.yamlDiff.updated).to.be.empty
    })
  })

  describe('findNotExistingEntities', () => {
    it('basic empty test', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = []
      const users: snowflake.ShowUser[] = []
      const sqlCommands: SqlCommand[] = []

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(0)
    })

    it('finds databases that do and don\'t exist', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = [
        {name: 'ORDER_HISTORY', database_name: 'ACME', schema_name: 'PROD', kind: 'TABLE'},
      ]
      const users: snowflake.ShowUser[] = []
      const sqlCommands: SqlCommand[] = [
        newSqlCommandWithEntities({type: 'DATABASE', id: 'ACME', action: 'create'}),
        newSqlCommandWithEntities({type: 'DATABASE', id: 'DOESNT_EXIST', action: 'create'}),
      ]

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(1)
      expect(missingEntities[0]).to.deep.equal({type: 'DATABASE', id: 'DOESNT_EXIST', action: 'create'})
    })

    it('finds schemas that do and don\'t exist', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = [
        {name: 'ORDER_HISTORY', database_name: 'ACME', schema_name: 'PROD', kind: 'TABLE'},
      ]
      const users: snowflake.ShowUser[] = []
      const sqlCommands: SqlCommand[] = [
        newSqlCommandWithEntities({type: 'DATABASE', id: 'ACME', action: 'create'}),
        newSqlCommandWithEntities({type: 'SCHEMA', id: 'ACME.PROD', action: 'create'}),
        newSqlCommandWithEntities({type: 'SCHEMA', id: 'ACME.DOESNT_EXIST', action: 'create'}),
      ]

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(1)
      expect(missingEntities[0]).to.deep.equal({type: 'SCHEMA', id: 'ACME.DOESNT_EXIST', action: 'create'})
    })

    it('finds tables that do and don\'t exist', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = [
        {name: 'ORDER_HISTORY', database_name: 'ACME', schema_name: 'PROD', kind: 'TABLE'},
        {name: 'PAYMENT_HISTORY', database_name: 'ACME', schema_name: 'PROD', kind: 'TABLE'},
      ]
      const users: snowflake.ShowUser[] = []
      const sqlCommands: SqlCommand[] = [
        newSqlCommandWithEntities({type: 'DATABASE', id: 'ACME', action: 'create'}),
        newSqlCommandWithEntities({type: 'SCHEMA', id: 'ACME.PROD', action: 'create'}),
        newSqlCommandWithEntities({type: 'TABLE', id: 'ACME.PROD.ORDER_HISTORY', action: 'create'}),
        newSqlCommandWithEntities({type: 'TABLE', id: 'ACME.PROD.DOESNT_EXIST', action: 'create'}),
      ]

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(1)
      expect(missingEntities[0]).to.deep.equal({type: 'TABLE', id: 'ACME.PROD.DOESNT_EXIST', action: 'create'})
    })

    it('skips objects that don\'t exist if permissions are being revoked', () => {
      const proposedRoles: YamlRoleDefinitions = {}
      const objects: snowflake.ShowObject[] = [
        {name: 'order_history', database_name: 'acme', schema_name: 'prod', kind: 'table'},
        {name: 'payment_history', database_name: 'acme', schema_name: 'prod', kind: 'table'},
      ]
      const users: snowflake.ShowUser[] = []
      const sqlCommands: SqlCommand[] = [
        newSqlCommandWithEntities({type: 'table', id: 'acme.prod.order_history', action: 'create'}),
        newSqlCommandWithEntities({type: 'table', id: 'acme.prod.doesnt_exist', action: 'delete'}),
      ]

      const missingEntities = spyglass._findNotExistingEntities(proposedRoles, objects, users, sqlCommands)
      expect(missingEntities).to.have.length(0)
    })
  })
})

function newSqlCommandWithEntities(e: Entity): SqlCommand {
  return {
    query: ['some query;', []],
    entities: [e],
  }
}
