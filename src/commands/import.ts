import {Args, Command} from '@oclif/core'
import { apiCall } from '../lib/api'
import {getConfig} from '../lib/config'

export default class Import extends Command {
  static description = 'Translate a database\'s current configuration into Spyglass format.'

  static examples = [
    `$ oex Login friend --from oclif
Login friend from oclif! (./src/commands/Login/index.ts)
`,
  ]

  static args = {
    accountId: Args.string({description: 'Account id to fetch configuration for.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Import)

    const {teamId, personalAccessToken} = await getConfig(this.config.configDir)

    const payload = {
      action: 'import',
      teamId,
      personalAccessToken,
      accountId: args.accountId,
    }
    const res = await apiCall(payload)
    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    this.log(res.data)
  }
}
