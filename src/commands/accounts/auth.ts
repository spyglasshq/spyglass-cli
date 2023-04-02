import {BaseCommand} from '../../lib/cmd'
import {Args, Flags, ux} from '@oclif/core'
import {AUTHENTICATOR_PASSWORD, checkConnection, Config, getSnowflakeConfig, saveConfig} from '../../lib/snowflake'

export default class Auth extends BaseCommand {
  static description = 'Authenticate to your Snowflake account.'

  static args = {
    accountId: Args.string({description: 'Account identifier (e.g. "zhjgixi-tv26532").', required: true}),
  }

  static flags = {
    check: Flags.boolean({description: 'Whether to verify that the connection can be established.'}),
  }

  async run(): Promise<void> {
    await this.init()

    const {args, flags} = await this.parse(Auth)

    const accountId = args.accountId.toLowerCase()

    const config = await getSnowflakeConfig()

    const existingConn = Object.values(config?.connections ?? {})?.find(conn => conn?.accountname === accountId)
    if (existingConn) {
      this.log(`There is already a connection configured in ~/.snowsql/config for account "${accountId}"`)

      if (flags.check) {
        ux.action.start('Checking connection')
        await checkConnection(accountId)
        ux.action.stop()
        this.log('Success!')
      }

      await this.logSuccessAndExit()
    }

    if (config) {
      this.log(`We found config at ~/.snowsql/config, but nothing for account "${accountId}". Let's add that account!`)
    } else {
      this.log('Welcome to Spyglass! Let\'s set up a ~/.snowsql/config file.')
      this.log('(See https://docs.snowflake.com/en/user-guide/snowsql-config for more info)')
      this.log('')
    }

    const username = await ux.prompt('Username (required)')
    const password = await ux.prompt('Password (required)', {type: 'hide'})
    const warehouse = ''
    const role = ''

    if (config) {
      const connections = config.connections ?? {}
      connections[accountId] = {accountname: accountId, username, password, warehousename: warehouse, rolename: role, authenticator: AUTHENTICATOR_PASSWORD}
      config.connections = connections
      await saveConfig(config)
    } else {
      const newConfig: Config = {
        connections: {
          [accountId]: {accountname: accountId, username, password, warehousename: warehouse, rolename: role, authenticator: AUTHENTICATOR_PASSWORD},
        },
      }
      await saveConfig(newConfig)
    }



    if (flags.check) {
      ux.action.start('Checking connection')
      await checkConnection(accountId)
      ux.action.stop()
      this.log('Success!')
    }

    await this.logSuccessAndExit()
  }
}
