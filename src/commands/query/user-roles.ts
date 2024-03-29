import {Args, ux} from '@oclif/core'
import {BaseCommand} from '../../lib/cmd'
import {userRolesFromYaml} from '../../lib/query'
import {readYamlForAccountId} from '../../lib/yaml-files'

export default class UserObjects extends BaseCommand {
  public static enableJsonFlag = true

  static description = 'Get a list of roles a user has access to.'

  static args = {
    accountId: Args.string({description: 'Current account id for config.', required: true, parse: async a => a.toLowerCase()}),
    username: Args.string({description: 'Username to look up.', required: true}),
  }

  async run(): Promise<unknown> {
    await this.init()

    const {args, flags} = await this.parse(UserObjects)

    const yaml = await readYamlForAccountId(args.accountId, flags.dir)

    const userRoles = userRolesFromYaml(yaml, args.username)

    const tree = ux.tree()

    for (const role of userRoles.roles) {
      let node = tree

      for (const parentRole of role.parents) {
        if (!node.nodes?.[parentRole]) {
          node.insert(parentRole)
        }

        node = node.nodes?.[parentRole]
      }

      node.insert(role.name)
    }

    tree.display()

    return userRoles
  }
}
