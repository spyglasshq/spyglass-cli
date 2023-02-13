/* eslint-disable max-depth */
import {Args, Command, ux} from '@oclif/core'
import color from '@oclif/color'
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {readYamlFile, YamlDiff} from '../lib/yaml'
import {stringify} from 'yaml'

const replacer = (key: string, value: unknown) => value === undefined ? null : value

export default class Diff extends Command {
  static description = 'Convert Spyglass configuration to native database commands and execute them.'

  static args = {
    'current-file': Args.string({description: 'Current account configuration yaml.', required: true}),
    'proposed-file': Args.string({description: 'Proposed changes to account configuration yaml.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Diff)

    const cfg = await getConfig(this.config.configDir)

    const currentFile = args['current-file']
    const proposedFile = args['proposed-file']

    const current = await readYamlFile(currentFile)
    const proposed = await readYamlFile(proposedFile)

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
    // this.log(stringify(yamlDiffs))
    for (const yamlDiff of yamlDiffs) {
      this.log(color.bold(`diff --spyglass a/${currentFile} b/${proposedFile}`))
      this.log(color.bold(`--- a/${currentFile}`))
      this.log(color.bold(`--- b/${proposedFile}`))

      for (const [roleName, role] of Object.entries(yamlDiff.added)) {
        this.log(color.cyan(`@@ role:${roleName} @@`))
        const yamlRoleLines = stringify(role, replacer).split('\n')
        const printRole = yamlRoleLines.map((line, i) => {
          if (i === yamlRoleLines.length - 1) {
            return '  ' + line
          }

          return color.green('+ ' + line)
        }).join('\n')
        this.log(printRole)
      }

      for (const [roleName, role] of Object.entries(yamlDiff.deleted)) {
        this.log(color.cyan(`@@ role:${roleName} @@`))
        const yamlRoleLines = stringify(role, replacer).split('\n')
        const printRole = yamlRoleLines.map((line, i) => {
          if (i === yamlRoleLines.length - 1) {
            return '  ' + line
          }

          return color.red('- ' + line)
        }).join('\n')
        this.log(printRole)
      }
    }
  }
}
