import {Args, ux} from '@oclif/core'
import {BaseCommand} from '../lib/cmd'
import color from '@oclif/color'
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

    this.log('Fetching current Snowflake configuration')
    try {
      const newYaml = await this.fetchSync(cfg, yaml)

      writeYamlForAccountId(args['account-id'], newYaml, flags.dir)

      this.log(color.bold(`Successfully updated current configuration to ${args['account-id']}.yaml.`))
    } catch (error: any) {
      this.log(`Encountered an error: ${error.message}`)
      this.exit(1)
    }

    await this.logSuccess()
  }

  async fetchSync(cfg: Config, yaml: Yaml): Promise<Yaml> {
    const showProgress = !process.env.SPYGLASS_HIDE_PROGRESS_BAR

    const progress = ux.progress({
      format: 'Progress | {bar} | {value}/{total} Objects',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    })

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

    const newYaml = await syncSnowflake(
      yaml,
      total => showProgress && progress.start(total, 0),
      current => showProgress && progress.update(current),
    )

    if (showProgress) {
      progress.stop()
    }

    return newYaml
  }
}
