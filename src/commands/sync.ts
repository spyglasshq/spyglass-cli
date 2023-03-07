import {Args, ux} from '@oclif/core'
import {BaseCommand} from '../lib/cmd'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {Config, getConfig} from '../lib/config'
import {readYamlForAccountId, writeYamlForAccountId, Yaml} from '../lib/yaml'
import {syncSnowflake} from '../lib/spyglass'

export default class Sync extends BaseCommand {
  static description = 'Update an existing yaml file using the database\'s current configuration.'

  static args = {
    'account-id': Args.string({description: 'Account id to sync from.', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Sync)

    const cfg = await getConfig(this.config.configDir)

    const yaml = await readYamlForAccountId(args['account-id'], flags.dir)

    ux.action.start('Fetching current Snowflake configuration')
    try {
      const newYaml = await this.fetchSync(cfg, yaml)
      ux.action.stop()

      writeYamlForAccountId(args['account-id'], newYaml, flags.dir)

      this.log(color.bold(`Successfully updated current configuration to ${args['account-id']}.yaml.`))
    } catch (error: any) {
      ux.action.stop()
      this.log(`Encountered an error: ${error.message}`)
    }
  }

  async fetchSync(cfg: Config, yaml: Yaml): Promise<Yaml> {
    if (cfg?.cloudMode) {
      const payload = {
        action: 'sync',
        files: [yaml],
      }
      const res = await apiCall(cfg, payload)

      if (res.data.error) {
        throw new Error(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      }

      return res.data
    }

    return syncSnowflake(yaml)
  }
}
