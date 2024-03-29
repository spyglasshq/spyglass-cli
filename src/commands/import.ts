import {Args, ux} from '@oclif/core'
import {BaseCommand} from '../lib/cmd'
import color from '@oclif/color'
import {Config, getConfig} from '../lib/config'
import {Yaml} from '../lib/yaml'
import {writeYamlForAccountId} from '../lib/yaml-files'

export default class Import extends BaseCommand {
  static description = 'Translate a database\'s current configuration into Spyglass format.'

  static args = {
    accountId: Args.string({description: 'Account id to fetch configuration from.', required: true, parse: async a => a.toLowerCase()}),
  }

  static flags = {}

  async run(): Promise<void> {
    await this.init()

    const {args, flags} = await this.parse(Import)

    const cfg = await getConfig(this.config.configDir)

    this.log('Fetching current Snowflake configuration...')
    try {
      const yaml = await this.fetchYaml(cfg, args.accountId)

      await writeYamlForAccountId(args.accountId, yaml, flags.dir)

      this.log(color.bold(`Successfully wrote current configuration to ${args.accountId}.yaml.`))
    } catch (error: any) {
      this.log(`Encountered an error: ${error.message}`)
      await this.logErrorAndExit(error)
    }

    await this.logSuccessAndExit()
  }

  async fetchYaml(cfg: Config, accountId: string): Promise<Yaml> {
    const progress = ux.progress({
      format: 'Progress | {bar} | {value}/{total} Access Rules',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    })

    // if (cfg?.cloudMode) {
    //   const payload = {
    //     action: 'import',
    //     accountId,
    //   }
    //   const res = await apiCall(cfg, payload)

    //   if (res.data.error) {
    //     throw new Error(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
    //   }

    //   return res.data
    // }

    const yaml = await this.spyglass.import({
      accountId,
      onStart: total => progress.start(total, 0),
      onProgress: current => progress.update(current),
    })

    progress.stop()

    return yaml
  }
}
