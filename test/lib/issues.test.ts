import * as issues from '../../src/lib/issues'
import {expect, use} from 'chai'
import {readYamlFile} from '../../src/lib/yaml-files'
import * as chaiAsPromised from 'chai-as-promised'

use(chaiAsPromised)

describe('issues', () => {
  describe('findIssues', async () => {
    it('finds many issues', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')
      const issueList = await issues.findIssues(yaml)
      expect(issueList).to.have.length(2)
    })
  })

  describe('getIssueDetail', async () => {
    it('throws not found', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')
      expect(issues.getIssueDetail(yaml, 'nonexistent-id')).to.be.rejectedWith(new Error('issue not found'))
    })

    it('gets issue detail', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')
      const issue = await issues.getIssueDetail(yaml, '4492bb31ea09')

      const data = issue.data as issues.DatabasePrivilege
      expect(data.role).to.equal('ACME_PROD_ALL_TABLES_VIEWER')
      expect(data.privilege).to.equal('USAGE')
      expect(data.database).to.equal('ACME')
    })
  })

  describe('SR1001', async () => {
    it('finds missing usage', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')
      const issueList = issues.ISSUE_HANDLERS.SR1001.findIssues(yaml)
      expect(issueList).to.have.length(2)
    })

    it('fixes missing usage', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')

      const issueList = issues.ISSUE_HANDLERS.SR1001.findIssues(yaml)
      expect(issueList).to.have.length(2)

      issues.ISSUE_HANDLERS.SR1001.fixYaml(yaml, issueList[0].data)
      issues.ISSUE_HANDLERS.SR1001.fixYaml(yaml, issueList[1].data)
      expect(yaml.roleGrants.ACME_PROD_ALL_TABLES_VIEWER?.USAGE?.DATABASE).to.deep.equal(['ACME', 'ACME2'])

      const newIssueList = issues.ISSUE_HANDLERS.SR1001.findIssues(yaml)
      expect(newIssueList).to.have.length(0)
    })
  })

  describe('SR1002', async () => {
    it('finds missing usage', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1002.yaml')
      const issueList = issues.ISSUE_HANDLERS.SR1002.findIssues(yaml)
      expect(issueList).to.have.length(2)
    })

    it('fixes missing usage', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1002.yaml')

      const issueList = issues.ISSUE_HANDLERS.SR1002.findIssues(yaml)
      expect(issueList).to.have.length(2)

      issues.ISSUE_HANDLERS.SR1002.fixYaml(yaml, issueList[0].data)
      issues.ISSUE_HANDLERS.SR1002.fixYaml(yaml, issueList[1].data)
      expect(yaml.roleGrants.ACME_PROD_ALL_TABLES_VIEWER?.USAGE?.SCHEMA).to.deep.equal(['ACME.PROD', 'ACME.STAGING'])

      const newIssueList = issues.ISSUE_HANDLERS.SR1002.findIssues(yaml)
      expect(newIssueList).to.have.length(0)
    })
  })

  describe('SR1005', async () => {
    it('finds missing sysadmin roles', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1005.yaml')
      const issueList = issues.ISSUE_HANDLERS.SR1005.findIssues(yaml)
      expect(issueList).to.have.length(2)
    })

    it('fixes missing sysadmin roles', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1005.yaml')

      const issueList = issues.ISSUE_HANDLERS.SR1005.findIssues(yaml)
      expect(issueList).to.have.length(2)

      issues.ISSUE_HANDLERS.SR1005.fixYaml(yaml, issueList[0].data)
      expect(yaml.roleGrants.SYSADMIN?.USAGE?.ROLE).to.deep.equal(['FOO'])

      const issueList2 = issues.ISSUE_HANDLERS.SR1005.findIssues(yaml)
      expect(issueList2).to.have.length(1)

      issues.ISSUE_HANDLERS.SR1005.fixYaml(yaml, issueList2[0].data)
      expect(yaml.roleGrants.SYSADMIN?.USAGE?.ROLE).to.deep.equal(['BAR', 'FOO'])

      const newIssueList = issues.ISSUE_HANDLERS.SR1005.findIssues(yaml)
      expect(newIssueList).to.have.length(0)
    })
  })
})
