import {Args, Command, ux} from '@oclif/core'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {readYamlFile, writeYamlFile} from '../lib/yaml'

export default class Sync extends Command {
  static description = 'Update an existing yaml file using database\' current configuration.'

  static args = {
    filename: Args.string({description: 'File to sync to.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Sync)

    const cfg = await getConfig(this.config.configDir)

    const file = await readYamlFile(args.filename)

    const payload = {
      action: 'sync',
      files: [file],
    }

    ux.action.start('Fetching current Snowflake configuration')
    const res = await apiCall(cfg, payload)
    ux.action.stop()

    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    writeYamlFile(args.filename, res.data.yaml)

    this.log(color.bold(`Successfully updated current configuration to ${args.filename}.`))
  }
}
