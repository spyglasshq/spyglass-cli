import * as issues from '../../src/lib/issues'
import {expect, use} from 'chai'
import {readYamlFile} from '../../src/lib/yaml'
import * as chaiAsPromised from 'chai-as-promised'

use(chaiAsPromised)

describe('difftools', () => {
  describe('findIssues', async () => {
    it('finds many issues', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')
      const issueList = await issues.findIssues(yaml)
      expect(issueList).to.have.length(1)
    })
  })

  describe('getIssueDetail', async () => {
    it('throws not found', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')
      expect(issues.getIssueDetail(yaml, 'nonexistent-id')).to.be.rejectedWith(new Error('issue not found'))
    })

    it('gets issue detail', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')
      const issue = await issues.getIssueDetail(yaml, 'fbf1af0675dc')

      const data = issue.data as issues.DatabasePrivilege
      expect(data.role).to.equal('acme_prod_all_tables_viewer')
      expect(data.privilege).to.equal('usage')
      expect(data.database).to.equal('acme')
    })
  })

  describe('SR1001', async () => {
    it('finds missing usage', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')
      const issueList = issues.ISSUE_HANDLERS.SR1001.findIssues(yaml)
      expect(issueList).to.have.length(1)
    })

    it('fixes missing usage', async () => {
      const yaml = await readYamlFile('./test/testdata/issues-SR1001.yaml')

      const issueList = issues.ISSUE_HANDLERS.SR1001.findIssues(yaml)
      expect(issueList).to.have.length(1)

      issues.ISSUE_HANDLERS.SR1001.fixYaml(yaml, issueList[0].data)
      expect(yaml.roleGrants.acme_prod_all_tables_viewer?.usage?.database).to.deep.equal(['acme'])

      const newIssueList = issues.ISSUE_HANDLERS.SR1001.findIssues(yaml)
      expect(newIssueList).to.have.length(0)
    })
  })
})
