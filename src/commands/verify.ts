import {Args, Flags, ux} from '@oclif/core'
import {BaseCommand} from '../lib/cmd'
import color from '@oclif/color'
import {Config, getConfig} from '../lib/config'
import {Yaml} from '../lib/yaml'
import {readYamlForAccountId, updateYamlForAccountId} from '../lib/yaml-files'
import {Issue, IssueDetail, ISSUE_HANDLERS} from '../lib/issues'
import {printYamlDiff} from '../lib/print'

export default class Verify extends BaseCommand {
  static description = 'Scan Spyglass configuration for any issues and provide recommendations.'

  static flags = {
    fix: Flags.string({description: 'Try to find a fix to the provided issue ID.'}),
  }

  static args = {
    'account-id': Args.string({description: 'Account id to scan and verify.', required: true, parse: async a => a.toLowerCase()}),
  }

  async run(): Promise<void> {
    await this.init()

    const {args, flags} = await this.parse(Verify)

    let res

    ux.action.start('Verifying configuration')
    try {
      const cfg = await getConfig(this.config.configDir)
      const yaml = await readYamlForAccountId(args['account-id'], flags.dir)
      res = await this.fetchVerify(cfg, yaml, flags.fix)

      ux.action.stop()
    } catch (error: any) {
      ux.action.stop()
      this.log(`Encountered an error: ${error.message}`)
      await this.logErrorAndExit(error)
    }

    ux.action.stop()

    if (flags.fix) {
      const issue = res as IssueDetail
      if (!issue) {
        this.log('Issue not found')
        return
      }

      this.formatIssue(issue)
      const fixit = this.proposedChanges(issue, flags.dir)

      if (!fixit) {
        await this.logSuccessAndExit()
        return
      }

      const confirmed = await ux.confirm('Update your local file with this change? (y/n)')
      if (confirmed) {
        await fixit(args['account-id'])
        this.log('Done.')
      } else {
        this.log('Exit: Cancelled by user.')
      }

      await this.logSuccessAndExit()
    }

    for (const issue of res as Issue[]) {
      if (issue.status === 'resolved') {
        continue
      }

      this.formatIssue(issue)
    }

    await this.logSuccessAndExit()
  }

  async fetchVerify(cfg: Config, yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail> {
    // if (cfg?.cloudMode) {
    //   const payload = {
    //     action: 'verify',
    //     files: [yaml],
    //     issueId,
    //   }
    //   const res = await apiCall(cfg, payload)

    //   if (res.data.error) {
    //     throw new Error(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
    //   }

    //   return res.data.issues ?? res.data
    // }

    return this.spyglass.verify(yaml, issueId)
  }

  formatIssue(issue: IssueDetail | Issue): void {
    this.log(color.yellow(`${issue.issue.id}: ${issue.issue.name}`))

    let columnWidth = 0
    for (const key of Object.keys(issue.data)) {
      columnWidth = Math.max(columnWidth, key.length + 1)
    }

    const keyValues = [['id', issue.id], ...Object.entries(issue.data)]

    for (const [key, value] of keyValues) {
      if (!key) continue

      const name = key[0].toUpperCase() + key.slice(1) + ':'
      this.log(`  ${color.gray(name.padEnd(columnWidth, ' '))}   ${value}`)
    }

    this.log('')
  }

  proposedChanges(issue: IssueDetail, dir = '.'): ((accountId: string) => Promise<void>) | null {
    this.log(color.underline('Recommended Changes'))

    printYamlDiff(this, issue.yamlDiff)

    const handler = ISSUE_HANDLERS[issue.issue.id]
    if (handler) {
      return async (accountId: string): Promise<void> => {
        const contents = await readYamlForAccountId(accountId, dir) as Yaml

        const updatedContents = handler.fixYaml(contents, issue.data)

        await updateYamlForAccountId(accountId, updatedContents, dir)
      }
    }

    this.log(color.gray('  An automated fix isn\'t yet available for this issue, sorry!'))
    return null
  }
}
