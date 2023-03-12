import {Args} from '@oclif/core'
import color from '@oclif/color'
import {BaseCommand} from '../../lib/cmd'
import {getConfig} from '../../lib/config'

export default class Get extends BaseCommand {
  static description = 'Look up Spyglass configuration values.'

  static args = {
    key: Args.string({description: 'Configuration key to look up the value of. If absent, return all values'}),
  }

  async run(): Promise<void> {
    await this.init()

    const {args} = await this.parse(Get)

    const cfg = (await getConfig(this.config.configDir)) as any

    for (const [key, value] of Object.entries(cfg)) {
      if (args.key && key !== args.key) {
        continue
      }

      this.log(`${color.gray(key)}: ${value}`)
    }
  }
}
