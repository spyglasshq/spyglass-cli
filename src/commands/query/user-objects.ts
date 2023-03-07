import {Command, Args, ux} from '@oclif/core'
import {userAccessFromYaml} from '../../lib/query'
import {readYamlForAccountId} from '../../lib/yaml'

export default class UserObjects extends Command {
  static description = 'Get a list of objects a user has access to.'

  static args = {
    accountId: Args.string({description: 'Current account id for config.', required: true}),
    username: Args.string({description: 'Username to look up.', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(UserObjects)

    const yaml = await readYamlForAccountId(args.accountId)

    const userAccess = userAccessFromYaml(yaml, args.username)

    ux.table(userAccess.objects, {
      objectType: {
        header: 'Object Type',
        // minWidth: 18,
      },
      objectId: {
        header: 'Object ID',
      },
      roleChain: {
        header: 'Role Chain',
        get: row => (row.roleChain as string[]).join(' -> '),
      },
    }, {
      printLine: this.log.bind(this),
    })
  }
}
