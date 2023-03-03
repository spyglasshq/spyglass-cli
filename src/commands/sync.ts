import {Args, Command, ux} from '@oclif/core'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {Config, getConfig} from '../lib/config'
import {readYamlFile, writeYamlFile, Yaml} from '../lib/yaml'
import {syncSnowflake} from '../lib/spyglass'

export default class Sync extends Command {
  static description = 'Update an existing yaml file using the database\'s current configuration.'

  static args = {
    filename: Args.string({description: 'File to sync to.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Sync)

    const cfg = await getConfig(this.config.configDir)

    const yaml = await readYamlFile(args.filename)

    ux.action.start('Fetching current Snowflake configuration')
    try {
      const newYaml = await this.fetchSync(cfg, yaml)
      ux.action.stop()

      writeYamlFile(args.filename, newYaml)

      this.log(color.bold(`Successfully updated current configuration to ${args.filename}.`))
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
