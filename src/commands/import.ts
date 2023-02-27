import {Args, Command, ux} from '@oclif/core'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {Config, getConfig} from '../lib/config'
import {writeYamlFile, Yaml} from '../lib/yaml'
import {importSnowflake} from '../lib/spyglass'

export default class Import extends Command {
  static description = 'Translate a database\'s current configuration into Spyglass format.'

  static args = {
    accountId: Args.string({description: 'Account id to fetch configuration for.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Import)

    const cfg = await getConfig(this.config.configDir)

    ux.action.start('Fetching current Snowflake configuration')
    try {
      const yaml = await this.fetchYaml(cfg, args.accountId)
      ux.action.stop()

      const filename = args.accountId + '.yaml'
      writeYamlFile(filename, yaml)

      this.log(color.bold(`Successfully wrote current configuration to ${filename}.`))
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
