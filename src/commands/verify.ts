import {Args, Command} from '@oclif/core'
import {stringify} from 'yaml'
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'

export default class Verify extends Command {
  static description = 'Translate a database\'s current configuration into Spyglass format.'

  static args = {
    accountId: Args.string({description: 'Account id to fetch configuration for.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Verify)

    const cfg = await getConfig(this.config.configDir)

    const payload = {
      action: 'verify',
      accountId: args.accountId,
    }
    const res = await apiCall(cfg, payload)
    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    this.log(stringify(res.data.roles))
  }
}
