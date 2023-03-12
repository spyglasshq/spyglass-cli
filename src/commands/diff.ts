import {Args, Flags, Command, ux} from '@oclif/core'
import color from '@oclif/color'
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {parseYamlFile, readYamlFile, YamlDiff, YamlRole} from '../lib/yaml'
import {stringify} from 'yaml'
import {readFileAtBranch} from '../lib/git'

const replacer = (key: string, value: unknown) => value === undefined ? null : value

export default class Diff extends Command {
  static hidden = true // may not need diff anymore

  static description = 'Check the difference between Spyglass config across git branches.'

  static flags = {
    branch: Flags.string({description: 'The branch to compare current changes against.', default: 'master'}),
  }

  static args = {
    filepath: Args.string({description: 'Current account configuration yaml.', required: true}),
  }

  async run(): Promise<void> {
    await this.init()

    const {args, flags} = await this.parse(Diff)

    const cfg = await getConfig(this.config.configDir)

    const filepath = args.filepath

    const proposed = await readYamlFile(filepath)
    const current = await parseYamlFile(await readFileAtBranch(args.filepath, flags.branch))

    const payload = {
      action: 'diff',
      currentFiles: [current],
      proposedFiles: [proposed],
    }

    ux.action.start('Diffing configuration files')
    const res = await apiCall(cfg, payload)
    ux.action.stop()

    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    const yamlDiffs: YamlDiff[] = res.data.yamlDiffs

    for (const yamlDiff of yamlDiffs) {
      this.log(color.bold(`diff --spyglass a/${filepath} b/${filepath}`))
      this.log(color.bold(`--- a/${filepath}`))
      this.log(color.bold(`--- b/${filepath}`))

      for (const [roleName, role] of Object.entries(yamlDiff.added)) {
        this.stringifyYamlDiff(roleName, role, line => {
          return color.green('+ ' + line)
        })
      }

      for (const [roleName, role] of Object.entries(yamlDiff.deleted)) {
        this.stringifyYamlDiff(roleName, role, line => {
          return color.red('- ' + line)
        })
      }
    }
  }

  stringifyYamlDiff(roleName: string, role: YamlRole, printer: (line: string) => string): void {
    this.log(color.cyan(`@@ role:${roleName} @@`))
    const yamlRoleLines = stringify(role, replacer).split('\n')
    const printRole = yamlRoleLines.map((line, i) => {
      if (i === yamlRoleLines.length - 1) {
        return '  ' + line
      }

      return printer(line)
    }).join('\n')
    this.log(printRole)
  }
}
