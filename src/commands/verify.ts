import {Args, Command, Flags, ux} from '@oclif/core'
import color from '@oclif/color'
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {readYamlFile, writeYamlFile, Yaml} from '../lib/yaml'
import {DatabasePrivilege, IssueDetail, ISSUE_HANDLERS, SchemaPrivilege, WarehouseResize} from '../lib/issues'
import {printYamlDiff} from '../lib/print'

export default class Verify extends Command {
  static description = 'Scan Spyglass configuration for any issues and provide recommendations.'

  static flags = {
    fix: Flags.string({description: 'Try to find a fix to the provided issue ID.'}),
  }

  static args = {
    filename: Args.string({description: 'File to scan and verify.', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Verify)

    const cfg = await getConfig(this.config.configDir)

    const contents = await readYamlFile(args.filename)

    const payload = {
      action: 'verify',
      files: [contents],
      issueId: flags.fix,
    }

    ux.action.start('Verifying configuration')
    const res = await apiCall(cfg, payload)
    ux.action.stop()

    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    if (flags.fix) {
      const issue = res.data
      if (!issue) {
        this.log('Issue not found')
        return
      }

      this.formatIssue(issue)
      const fixit = this.proposedChanges(issue)

      if (!fixit) {
        return
      }

      const confirmed = await ux.confirm('Update your local file with this change? (y/n)')
      if (confirmed) {
        await fixit(args.filename)
        this.log('Done.')
      } else {
        this.log('Exit: Cancelled by user.')
      }

      return
    }

    for (const issue of res.data.issues) {
      if (issue.status === 'resolved') {
        continue
      }

      this.formatIssue(issue)
    }
  }

  formatIssue(issue: IssueDetail): void {
    this.log(color.yellow(`${issue.issue.id}: ${issue.issue.name}`))

    let columnWidth = 0
    for (const key of Object.keys(issue.data)) {
      columnWidth = Math.max(columnWidth, key.length + 1)
    }

    for (const [key, value] of Object.entries(issue.data)) {
      const name = key[0].toUpperCase() + key.slice(1) + ':'
      this.log(`  ${color.gray(name.padEnd(columnWidth, ' '))}   ${value}`)
    }

    this.log('')
  }

  proposedChanges(issue: IssueDetail): ((filename: string) => Promise<void>) | null {
    this.log(color.underline('Recommended Changes'))

    printYamlDiff(this, issue.yamlDiff)

    if (issue.issue.id === 'SR1003') {
      const utilizationData = [
        {date: '2023-2-9', avgUtilization: '23%', peakUtilization: '36%', minsQueued: '0'},
        {date: '2023-2-10', avgUtilization: '22%', peakUtilization: '45%', minsQueued: '0'},
        {date: '2023-2-11', avgUtilization: '17%', peakUtilization: '38%', minsQueued: '0'},
        {date: '2023-2-12', avgUtilization: '32%', peakUtilization: '54%', minsQueued: '0'},
        {date: '2023-2-13', avgUtilization: '25%', peakUtilization: '36%', minsQueued: '0'},
        {date: '2023-2-14', avgUtilization: '29%', peakUtilization: '40%', minsQueued: '0'},
        {date: '2023-2-15', avgUtilization: '31%', peakUtilization: '41%', minsQueued: '0'},
      ]

      this.log(color.underline('Details'))
      this.log(color.white('Projected Impact:'))
      this.log(`  ${color.gray('Roles:')}                   customer_support, product_managers`)
      this.log(`  ${color.gray('Number of Users:')}         37`)
      this.log(`  ${color.gray('Monthly Savings:')}         $ 522`)
      this.log('')
      this.log(color.white('Detection Data:'))
      ux.table(utilizationData, {
        date: {
          header: 'Date',
          minWidth: 18,
        },
        avgUtilization: {
          header: 'Avg. Utilization',
        },
        peakUtilization: {
          header: 'Peak Utilization',
        },
        minsQueued: {
          header: 'Mins. Queued',
        },
      }, {
        printLine: this.log.bind(this),
      })
      this.log('')
    }

    const handler = ISSUE_HANDLERS[issue.issue.id]
    if (handler) {
      return async (filename: string): Promise<void> => {
        const contents = await readYamlFile(filename) as Yaml

        const updatedContents = handler.fixYaml(contents, issue.data)

        await writeYamlFile(filename, updatedContents)
      }
    }

    this.log(color.gray('  An automated fix isn\'t yet available for this issue, sorry!'))
    return null
  }
}
