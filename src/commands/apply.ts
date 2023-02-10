import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {parse} from 'yaml'
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'

export default class Apply extends Command {
  static description = 'Convert Spyglass configuration to native database commands and execute them.'

  static flags = {
    'dry-run': Flags.boolean({description: 'Dry run', default: false}),
  }

  static args = {
    filename: Args.string({description: 'File to apply configuration for.', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Apply)

    const cfg = await getConfig(this.config.configDir)

    const file = await readFile(args.filename)
    const contents = parse(file.toString())

    const payload = {
      action: 'apply',
      dryRun: flags['dry-run'],
      files: {
        [args.filename]: contents,
      },
    }
    this.log(JSON.stringify(payload))

    const res = await apiCall(cfg, payload)
    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    this.log(res.data)
  }
}
