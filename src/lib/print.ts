import color from '@oclif/color'
import {YamlDiff} from './yaml'
import {stringify} from 'yaml'

interface logger {
  log(message: string): void
}

const replacer = (key: string, value: unknown) => value === undefined ? null : value

export function printYamlDiff(self: logger, yamlDiff: YamlDiff): void {
  // TODO(tyler): we should really print "current" and then only +/- for the removed/added lines

  for (const [objType, objs] of Object.entries(yamlDiff.added)) {
    for (const [objName, obj] of Object.entries(objs)) {
      stringifyYamlDiff(self, objType, objName, obj, line => {
        return color.green('+ ' + line)
      })
    }
  }

  for (const [objType, objs] of Object.entries(yamlDiff.deleted)) {
    for (const [objName, obj] of Object.entries(objs)) {
      stringifyYamlDiff(self, objType, objName, obj, line => {
        return color.red('- ' + line)
      })
    }
  }

  for (const [objType, objs] of Object.entries(yamlDiff.updated)) {
    for (const [objName, obj] of Object.entries(objs)) {
      stringifyYamlDiff(self, objType, objName, obj, line => {
        return color.yellow('~ ' + line)
      })
    }
  }
}

// eslint-disable-next-line max-params
function stringifyYamlDiff(self: logger, objType: string, objName: string, data: unknown, printer: (line: string) => string): void {
  self.log(color.cyan(`@@ ${objType}:${objName} @@`))

  const yamlRoleLines = stringify(data, replacer).split('\n')
  const printRole = yamlRoleLines.map((line, i) => {
    if (i === yamlRoleLines.length - 1) {
      return '  ' + line
    }

    return printer(line)
  }).join('\n')

  self.log(printRole)
}
