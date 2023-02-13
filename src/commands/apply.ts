import {Args, Command, Flags, ux} from '@oclif/core'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {parseYamlFile, readYamlFile} from '../lib/yaml'
import {readFileAtBranch} from '../lib/git'

export default class Apply extends Command {
  static description = 'Convert Spyglass configuration to native database commands and execute them.'

  static flags = {
    'dry-run': Flags.boolean({description: 'Dry run', default: false}),
    confirm: Flags.boolean({description: 'Skip the interactive prompt (used in CI)', default: false}),
    branch: Flags.string({description: 'The branch to compare current changes against.', default: 'master'}),
  }

  static args = {
    filepath: Args.string({description: 'Current account configuration yaml.', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Apply)

    const cfg = await getConfig(this.config.configDir)

    const filepath = args.filepath

    const proposed = await readYamlFile(filepath)
    const current = await parseYamlFile(await readFileAtBranch(args.filepath, flags.branch))

    const payload = {
      action: 'apply',
      dryRun: true, // first run is always dry, so we can show user what will happen
      currentFiles: [current],
      proposedFiles: [proposed],
    }

    ux.action.start('Fetching current Snowflake configuration')
    const res = await apiCall(cfg, payload)
    ux.action.stop()

    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    // Print SQL differences.
    for (const [accountId, commands] of Object.entries(res.data.sqlCommands)) {
      this.log(color.bold(`Account ${accountId} SQL updates:`))
      for (const command of commands as string[]) {
        this.log(color.cyan(`  ${command}`))
      }
    }

    // We can exit if this is a dry run.
    if (flags['dry-run']) {
      this.log('Exit: User specified dry run.')
      return
    }

    if (flags.confirm) {
      this.log('Execution confirmed by command line flag, skipping interactive prompt (this is normal in CI environments).')
    } else if (!flags.confirm) {
      // If --confirm isn't provided, get interactive confirmation from user.
      const confirm = await ux.confirm('Execute these commands? (y/n)')
      if (!confirm) {
        this.log('Exit: Cancelled by user.')
        return
      }
    }

    // Apply configuration to production.
    payload.dryRun = false
    ux.action.start('Applying updated Snowflake configuration')
    const res2 = await apiCall(cfg, payload)
    ux.action.stop()

    if (res2.data.error) {
      this.log(`Encountered an error: ${res2.data.error}, code: ${res2.data.code}`)
      return
    }

    this.log(color.bold('Success!'))

    this.log(JSON.stringify(res2.data))
  }
}
