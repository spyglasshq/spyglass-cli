import {Command, Args, ux} from '@oclif/core'
import {userRolesFromYaml} from '../../lib/query'
import {readYamlFile} from '../../lib/yaml'

export default class UserObjects extends Command {
  static description = 'Get a list of roles a user has access to.'

  static args = {
    filepath: Args.string({description: 'Current account configuration yaml.', required: true}),
    username: Args.string({description: 'Username to look up.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(UserObjects)

    const filepath = args.filepath

    const yaml = await readYamlFile(filepath)

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
  }
}
