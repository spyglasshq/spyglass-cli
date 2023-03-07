import {Args, ux} from '@oclif/core'
import {BaseCommand} from '../lib/cmd'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {Config, getConfig} from '../lib/config'
import {writeYamlForAccountId, Yaml} from '../lib/yaml'
import {importSnowflake} from '../lib/spyglass'

export default class Import extends BaseCommand {
  static description = 'Translate a database\'s current configuration into Spyglass format.'

  static args = {
    accountId: Args.string({description: 'Account id to fetch configuration from.', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Import)

    const cfg = await getConfig(this.config.configDir)

    ux.action.start('Fetching current Snowflake configuration')
    try {
      const yaml = await this.fetchYaml(cfg, args.accountId)
      ux.action.stop()

      writeYamlForAccountId(args.accountId, yaml, flags.dir)

      this.log(color.bold(`Successfully wrote current configuration to ${args.accountId}.yaml.`))
    } catch (error: any) {
      ux.action.stop()
      this.log(`Encountered an error: ${error.message}`)
    }
  }

  async fetchYaml(cfg: Config, accountId: string): Promise<Yaml> {
    if (cfg?.cloudMode) {
      const payload = {
        action: 'import',
        accountId,
      }
      const res = await apiCall(cfg, payload)

      if (res.data.error) {
        throw new Error(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      }

      return res.data
    }

    return importSnowflake(accountId)
  }
}
