import {Args, ux} from '@oclif/core'
import {BaseCommand} from '../lib/cmd'
import color from '@oclif/color'
import {Config, getConfig} from '../lib/config'
import {Yaml} from '../lib/yaml'
import {readYamlForAccountId, writeYamlForAccountId} from '../lib/yaml-files'

export default class Sync extends BaseCommand {
  static description = 'Update an existing yaml file using the database\'s current configuration.'

  static args = {
    'account-id': Args.string({description: 'Account id to sync from.', required: true}),
  }

  async run(): Promise<void> {
    await this.init()

    const {args, flags} = await this.parse(Sync)

    const cfg = await getConfig(this.config.configDir)

    try {
      const yaml = await readYamlForAccountId(args['account-id'], flags.dir)

      this.log('Fetching current Snowflake configuration')

      const newYaml = await this.fetchSync(cfg, yaml)

      await writeYamlForAccountId(args['account-id'], newYaml, flags.dir)

      this.log(color.bold(`Successfully updated current configuration to ${args['account-id']}.yaml.`))
    } catch (error: any) {
      this.log(`Encountered an error: ${error.message}`)
      await this.logErrorAndExit(error)
    }

    await this.logSuccessAndExit()
  }

  async fetchSync(cfg: Config, yaml: Yaml): Promise<Yaml> {
    const showProgress = !process.env.SPYGLASS_HIDE_PROGRESS_BAR

    const progress = ux.progress({
      format: 'Progress | {bar} | {value}/{total} Access Rules',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    })

    // if (cfg?.cloudMode) {
    //   const payload = {
    //     action: 'sync',
    //     files: [yaml],
    //   }
    //   const res = await apiCall(cfg, payload)

    //   if (res.data.error) {
    //     throw new Error(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
    //   }

    //   return res.data
    // }

    const newYaml = await this.spyglass.sync({
      yaml,
      onStart: total => showProgress && progress.start(total, 0),
      onProgress: current => showProgress && progress.update(current),
    })

    if (showProgress) {
      progress.stop()
    }

    return newYaml
  }
}
