import {Args, Flags, ux} from '@oclif/core'
import {BaseCommand} from '../lib/cmd'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {Config, getConfig} from '../lib/config'
import {readYamlForAccountId, Yaml} from '../lib/yaml'
import {readYamlAtBranch} from '../lib/git'
import {applySnowflake} from '../lib/spyglass'
import {AppliedCommand} from '../lib/snowflake'

export default class Apply extends BaseCommand {
  static description = 'Convert Spyglass configuration to native database commands and execute them.'

  static flags = {
    'dry-run': Flags.boolean({description: 'Dry run', default: false}),
    confirm: Flags.boolean({description: 'Skip the interactive prompt (used in CI)', default: false}),
    'git-ref': Flags.string({description: 'The branch to compare current changes against.', default: 'master', aliases: ['branch']}),
  }

  static args = {
    'account-id': Args.string({description: 'Current account id for the configuration.', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Apply)

    let sqlCommands: AppliedCommand[] = []

    const proposed = await readYamlForAccountId(args['account-id'], flags.dir)
    const current = await readYamlAtBranch(args['account-id'], flags['git-ref'], flags.dir)

    ux.action.start('Checking current Snowflake configuration')
    try {
      const cfg = await getConfig(this.config.configDir)
      sqlCommands = await this.fetchApply(cfg, current, proposed, true /* dryRun */) // first run is always dry, so we can show user what will happen

      ux.action.stop()
    } catch (error: any) {
      ux.action.stop()
      this.log(`Encountered an error: ${error.message}`)
    }

    // Print SQL differences.
    for (const command of sqlCommands) {
      this.log(color.bold(`Account ${current.spyglass.accountId} SQL updates:`))
      this.log(color.cyan(`  ${command.sql}`))
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
    let res2

    ux.action.start('Applying updated Snowflake configuration')
    try {
      const cfg = await getConfig(this.config.configDir)
      const proposed = await readYamlForAccountId(args['account-id'])
      const current = await readYamlAtBranch(args['account-id'], flags['git-ref'], flags.dir)
      res2 = await this.fetchApply(cfg, current, proposed, false /* dryRun */)

      ux.action.stop()
    } catch (error: any) {
      ux.action.stop()
      this.log(`Encountered an error: ${error.message}`)
    }

    this.log(color.bold('Success!'))

    this.log(JSON.stringify(res2))
  }

  async fetchApply(cfg: Config, current: Yaml, proposed: Yaml, dryRun: boolean): Promise<AppliedCommand[]> {
    if (cfg?.cloudMode) {
      const payload = {
        action: 'apply',
        dryRun,
        currentFiles: [current],
        proposedFiles: [proposed],
      }

      const res = await apiCall(cfg, payload)
      if (res.data.error) {
        throw new Error(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      }

      return res.data
    }

    return applySnowflake(current, proposed, dryRun)
  }
}
