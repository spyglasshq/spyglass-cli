import {Command, Args, ux} from '@oclif/core'
import {objectAccessFromYaml} from '../../lib/query'
import {readYamlForAccountId} from '../../lib/yaml'

export default class ObjectUsers extends Command {
  static description = 'Get a list of users that have access to an object.'

  static args = {
    accountId: Args.string({description: 'Current account id for config.', required: true}),
    'object-id': Args.string({description: 'Fully qualified object ID to look up (e.g. "acme.prod.store_returns").', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(ObjectUsers)

    const yaml = await readYamlForAccountId(args.accountId)

    const objectAccess = objectAccessFromYaml(yaml, args['object-id'])

    ux.table(objectAccess.users, {
      username: {
        header: 'Username',
        // minWidth: 18,
      },
      privilege: {
        header: 'Privilege',
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
