import {Args, Command, Flags, ux} from '@oclif/core'
import color from '@oclif/color'
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {readYamlFile, writeYamlFile, Yaml} from '../lib/yaml'

interface IssueType {
  id: string;
  name: string;
}

interface Issue {
  id: string;
  issue: IssueType;
  category: string;
  data: DatabasePrivilege | SchemaPrivilege | WarehouseResize;
}

interface DatabasePrivilege {
  database: string;
  role: string;
  privilege: string;
}

interface SchemaPrivilege {
  schema: string;
  role: string;
  privilege: string;
}

interface WarehouseResize {
  warehouse: string;
  currentSize: string;
  recommendedSize: string;
}

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
    }

    ux.action.start('Verifying configuration')
    const res = await apiCall(cfg, payload)
    ux.action.stop()

    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    if (flags.fix) {
      const issue = res.data.issues.find((issue: any) => issue.id === flags.fix)
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
      this.formatIssue(issue)
    }
  }

  formatIssue(issue: Issue): void {
    this.log(color.yellow(`${issue.issue.id}: ${issue.issue.name}`))

    switch (issue.issue.id) {
    case 'SR1001': {
      const data = issue.data as DatabasePrivilege
      this.log(`  ${color.gray('ID:')}                ${issue.id}`)
      this.log(`  ${color.gray('Role:')}              ${data.role}`)
      this.log(`  ${color.gray('Needs Privilege:')}   ${data.privilege}`)
      this.log(`  ${color.gray('On Database:')}       ${data.database}`)

      break
    }

    case 'SR1002': {
      const data = issue.data as SchemaPrivilege
      this.log(`  ${color.gray('ID:')}                ${issue.id}`)
      this.log(`  ${color.gray('Role:')}              ${data.role}`)
      this.log(`  ${color.gray('Needs Privilege:')}   ${data.privilege}`)
      this.log(`  ${color.gray('On Schema:')}         ${data.schema}`)

      break
    }

    case 'SR1003': {
      const data = issue.data as WarehouseResize
      this.log(`  ${color.gray('ID:')}                     ${issue.id}`)
      this.log(`  ${color.gray('Warehouse:')}              ${data.warehouse}`)
      this.log(`  ${color.gray('Current Size:')}           ${data.currentSize}`)
      this.log(`  ${color.gray('Recommended Size:')}       ${data.recommendedSize}`)

      break
    }

    default: {
      this.log(`   ${color.gray(JSON.stringify(issue.data))}`)
    }
    }

    this.log('')
  }

  proposedChanges(issue: Issue): ((filename: string) => Promise<void>) | null {
    this.log(color.underline('Recommended Changes'))
    if (issue.issue.id === 'SR1001') {
      const data = issue.data as DatabasePrivilege

      // print proposed changes
      this.log(color.cyan(`@@ role:${data.role} @@`))
      this.log(color.green(`+ ${data.privilege}:`))
      this.log(color.green('+   database:'))
      this.log(color.green(`+     - ${data.database}`))
      this.log('')

      // function that applies the fix
      return async (filename: string): Promise<void> => {
        const contents = await readYamlFile(filename) as Yaml
        if (!contents.roleGrants[data.role][data.privilege]) {
          contents.roleGrants[data.role][data.privilege] = {}
        }

        if (!contents.roleGrants[data.role][data.privilege].database) {
          contents.roleGrants[data.role][data.privilege].database = []
        }

        contents.roleGrants[data.role][data.privilege].database.push(data.database)
        await writeYamlFile(filename, contents)
      }
    }

    if (issue.issue.id === 'SR1003') {
      const data = issue.data as WarehouseResize

      const utilizationData = [
        {date: '2023-2-9', avgUtilization: '23%', peakUtilization: '36%', minsQueued: '0'},
        {date: '2023-2-10', avgUtilization: '22%', peakUtilization: '45%', minsQueued: '0'},
        {date: '2023-2-11', avgUtilization: '17%', peakUtilization: '38%', minsQueued: '0'},
        {date: '2023-2-12', avgUtilization: '32%', peakUtilization: '54%', minsQueued: '0'},
        {date: '2023-2-13', avgUtilization: '25%', peakUtilization: '36%', minsQueued: '0'},
        {date: '2023-2-14', avgUtilization: '29%', peakUtilization: '40%', minsQueued: '0'},
        {date: '2023-2-15', avgUtilization: '31%', peakUtilization: '41%', minsQueued: '0'},
      ]

      // print proposed changes
      this.log(color.cyan(`@@ warehouse:${data.warehouse} @@`))
      this.log(color.green('+   size:'))
      this.log(color.red(`-     - ${data.currentSize}`))
      this.log(color.green(`+     - ${data.recommendedSize}`))
      this.log('')
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

      // function that applies the fix
      return async (filename: string): Promise<void> => {
        const contents = await readYamlFile(filename) as Yaml

        contents.warehouses[data.warehouse].size = data.recommendedSize

        await writeYamlFile(filename, contents)
      }
    }

    this.log(color.gray(' . An automated fix isn\'t yet available for this issue, sorry!'))
    return null
  }
}
