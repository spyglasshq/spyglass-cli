/* eslint-disable max-depth */
import {Args, Command, ux} from '@oclif/core'
import color from '@oclif/color';
import {apiCall} from '../lib/api'
import {getConfig} from '../lib/config'
import {readYamlFile} from '../lib/yaml';

export default class Diff extends Command {
  static description = 'Convert Spyglass configuration to native database commands and execute them.'

  static args = {
    filename: Args.string({description: 'File to use for diffing with Snowflake live configuration.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Diff)

    const cfg = await getConfig(this.config.configDir)

    const contents = await readYamlFile(args.filename)

    const payload = {
      action: 'diff',
      files: {
        [args.filename]: contents,
      },
    }

    const now = Math.floor((Date.now() / 1000)) // we should return timestamp from API instead
    ux.action.start('Fetching current Snowflake configuration')
    const res = await apiCall(cfg, payload)
    ux.action.stop()

    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    const yamlDiffs: YamlDiff = res.data.yamlDiffs
    for (const [filename, yamlDiff] of Object.entries(yamlDiffs)) {
      this.log(color.bold(`diff --spyglass a/snowflake:${now} b/${filename}`))
      this.log(color.bold(`--- a/snowflake:${now}`))
      this.log(color.bold(`--- b/${filename}`))

      for (const [roleName, role] of Object.entries(contents.roles)) {
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
            this.log(color.cyan(`@@ role:${roleName} @@`))

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
