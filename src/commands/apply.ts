/* eslint-disable max-depth */
import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import color from '@oclif/color';
import {parse, stringify} from 'yaml'
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
    const contents = parse(file.toString()) as YamlRoles

    const payload = {
      action: 'apply',
      dryRun: flags['dry-run'],
      files: {
        [args.filename]: contents,
      },
    }

    const res = await apiCall(cfg, payload)
    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    // show raw differences
    // show sql differences
    // if dry run, show both
    // if not dry run, ask confirmation to apply
    // (if --confirm, skip confirmation)

    const yamlDiffs: YamlDiff = res.data.yamlDiffs
    for (const [filename, yamlDiff] of Object.entries(yamlDiffs)) {
      this.log(color.bold(`diff --spyglass a/snowflake:current b/${filename}`))
      this.log(color.bold('--- a/snowflake:current'))
      this.log(color.bold(`--- b/${filename}`))

      for (const [roleName, role] of Object.entries(contents)) {
        let hasDiffs = false

        for (const [grantName, grants] of Object.entries(role)) {
          for (const [i, grant] of grants.entries()) {
            if (yamlDiff.added?.[roleName]?.[grantName]?.includes(grant)) {
              grants[i] = color.green('+  - ' + grant)
              hasDiffs = true
            } else {
              grants[i] = '   - ' + grant
            }
          }

          for (const deletedGrant of (yamlDiff.deleted?.[roleName]?.[grantName] || [])) {
            grants.push(color.red('-  - ' + deletedGrant))
            hasDiffs = true
          }

          if (hasDiffs) {
            this.log(color.cyan(`@@ ${roleName} @@`))

            // HACK: stringify yaml ourselves, it only goes one level deep, only displays arrays
            for (const [grantName, grants] of Object.entries(role)) {
              if (grants?.length > 0) {
                this.log(grantName + ':')
                for (const grant of grants) {
                  this.log(grant)
                }
              }
            }
          }
        }
      }
    }
  }
}

interface YamlRoles {
  [role: string]: YamlRole;
}

interface YamlRole {
  view?: string[];
  inherits?: string[];
}

interface YamlDiff {
  added: YamlRoles;
  deleted: YamlRoles
}
