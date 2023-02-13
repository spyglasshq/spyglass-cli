/* eslint-disable max-depth */
import {Args, Command, ux} from '@oclif/core'
import color from '@oclif/color'
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {readYamlFile, YamlDiff, YamlRole} from '../lib/yaml'
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

    for (const yamlDiff of yamlDiffs) {
      this.log(color.bold(`diff --spyglass a/${currentFile} b/${proposedFile}`))
      this.log(color.bold(`--- a/${currentFile}`))
      this.log(color.bold(`--- b/${proposedFile}`))

      // TODO(tyler): we should really print "current" and then only +/- for the removed/added lines

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
