import {Args} from '@oclif/core'
import {BaseCommand} from '../../lib/cmd'
import {createOrUpdateConfig} from '../../lib/config'

export default class Set extends BaseCommand {
  static description = 'Set Spyglass configuration values.'

  static args = {
    key: Args.string({description: 'Configuration key to set the value of.', required: true}),
    value: Args.string({description: 'Configuration value to set the value of.', required: true}),
  }

  async run(): Promise<void> {
    await this.init()

    const {args} = await this.parse(Set)

    const newCfg: any = {}

    if (args.key === 'disableAnalytics') {
      newCfg[args.key] = this.booleanFromString(args.value)
    } else {
      newCfg[args.key] = args.value
    }

    await createOrUpdateConfig(this.config.configDir, newCfg)

    this.log(`✅ Successfully set ${args.key} = ${args.value}.`)

    await this.logSuccessAndExit()
  }

  booleanFromString(s: string): boolean {
    return s.toLowerCase() === 'true' || s === '1'
  }
}
