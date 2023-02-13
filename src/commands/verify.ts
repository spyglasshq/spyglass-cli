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
  data: DatabasePrivilege | SchemaPrivilege;
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
    if (issue.issue.id === 'SR1001') {
      const data = issue.data as DatabasePrivilege
      this.log(`  ${color.gray('ID:')}                ${issue.id}`)
      this.log(`  ${color.gray('Role:')}              ${data.role}`)
      this.log(`  ${color.gray('Needs Privilege:')}   ${data.privilege}`)
      this.log(`  ${color.gray('On Database:')}       ${data.database}`)
    } else if (issue.issue.id === 'SR1002') {
      const data = issue.data as SchemaPrivilege
      this.log(`  ${color.gray('ID:')}                ${issue.id}`)
      this.log(`  ${color.gray('Role:')}              ${data.role}`)
      this.log(`  ${color.gray('Needs Privilege:')}   ${data.privilege}`)
      this.log(`  ${color.gray('On Schema:')}         ${data.schema}`)
    }

    this.log('')
  }

  proposedChanges(issue: Issue): ((filename: string) => Promise<void>) | null {
    this.log(color.yellow('Proposed Changes:'))
    if (issue.issue.id === 'SR1001') {
      const data = issue.data as DatabasePrivilege

      // print proposed changes
      this.log(color.cyan('@@ role:acme_prod_call_center_reader @@'))
      this.log(color.green(`+ ${data.privilege}:`))
      this.log(color.green('+   database:'))
      this.log(color.green(`+     - ${data.database}`))
      this.log('')

      // function that applies the fix
      return async (filename: string): Promise<void> => {
        const contents = await readYamlFile(filename) as Yaml
        if (!contents.roles[data.role][data.privilege]) {
          contents.roles[data.role][data.privilege] = {}
        }

        if (!contents.roles[data.role][data.privilege].database) {
          contents.roles[data.role][data.privilege].database = []
        }

        contents.roles[data.role][data.privilege].database.push(data.database)
        await writeYamlFile(filename, contents)
      }
    }

    this.log(color.gray('An automated fix isn\'t yet available for this issue, sorry!'))
    return null
  }
}
