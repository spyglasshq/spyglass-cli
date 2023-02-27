import {Args, Command, Flags, ux} from '@oclif/core'
import {AUTHENTICATOR_PASSWORD, checkConnection, Config, getSnowflakeConfig, saveConfig} from '../../lib/snowflake'

export default class Auth extends Command {
  static description = 'Translate a database\'s current configuration into Spyglass format.'

  static args = {
    accountId: Args.string({description: 'Account identifier (e.g. "zhjgixi-tv26532").', required: true}),
  }

  static flags = {
    check: Flags.boolean({description: 'Whether to verify that the connection can be established.'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Auth)

    const config = await getSnowflakeConfig()

    const existingConn = Object.values(config?.connections ?? {})?.find(conn => conn?.accountname === args.accountId)
    if (existingConn) {
      this.log(`There is already a connection configured in ~/.snowsql/config for account "${args.accountId}"`)

      if (flags.check) {
        ux.action.start('Checking connection')
        await checkConnection(args.accountId)
        ux.action.stop()
        this.log('Success!')
      }

      return
    }

    if (config) {
      this.log(`We found config at ~/.snowsql/config, but nothing for account "${args.accountId}". Let's add that account!`)
    } else {
      this.log('Welcome to Spyglass! Let\'s set up a ~/.snowsql/config file.')
      this.log('(See https://docs.snowflake.com/en/user-guide/snowsql-config for more info)')
      this.log('')
    }

    const username = await ux.prompt('Username (required)')
    const password = await ux.prompt('Password (required)', {type: 'hide'})
    const warehouse = ''
    const role = ''

    const newConfig: Config = {
      connections: {
        [args.accountId]: {accountname: args.accountId, username, password, warehousename: warehouse, rolename: role, authenticator: AUTHENTICATOR_PASSWORD},
      },
    }

    await saveConfig(newConfig)

    if (flags.check) {
      ux.action.start('Checking connection')
      await checkConnection(args.accountId)
      ux.action.stop()
      this.log('Success!')
    }
  }
}
