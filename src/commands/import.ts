import {Args, Command, ux} from '@oclif/core'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {writeYamlFile} from '../lib/yaml'

export default class Import extends Command {
  static description = 'Translate a database\'s current configuration into Spyglass format.'

  static args = {
    accountId: Args.string({description: 'Account id to fetch configuration for.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Import)

    const cfg = await getConfig(this.config.configDir)

    const payload = {
      action: 'import',
      accountId: args.accountId,
    }

    ux.action.start('Fetching current Snowflake configuration')
    const res = await apiCall(cfg, payload)
    ux.action.stop()

    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    const filename = args.accountId + '.yaml'
    writeYamlFile(filename, res.data)

    this.log(color.bold(`Successfully wrote current configuration to ${filename}.`))
  }
}
