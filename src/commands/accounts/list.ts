import {ux} from '@oclif/core'
import {BaseCommand} from '../../lib/cmd'
import {getConfig} from '../../lib/config'
import {getSnowflakeConfig} from '../../lib/snowflake'

export default class List extends BaseCommand {
  static description = 'List Snowflake acccounts.'

  async run(): Promise<void> {
    await this.init()

    const cfg = await getConfig(this.config.configDir)

    if (cfg?.cloudMode) {
      const accounts = [
        {
          accountId: 'zhjgixi-tv26532',
          accountUrl: 'https://qe39554.us-central1.gcp.snowflakecomputing.com',
          connectedOn: '1/31/2023',
          nickname: 'Production',
          type: 'Cloud Connection',
        },
        {
          accountId: 'zryewvz-yi01408',
          accountUrl: 'https://xd81502.us-central1.gcp.snowflakecomputing.com',
          connectedOn: '12/27/2022',
          nickname: 'Staging',
          type: 'Cloud Connection',
        },
        {
          accountId: 'oembzjb-qv08311',
          accountUrl: 'https://oc81182.us-central1.gcp.snowflakecomputing.com',
          connectedOn: '12/27/2022',
          nickname: 'Development',
          type: 'Cloud Connection',
        },
      ]

      ux.table(accounts, {
        accountId: {
          header: 'ID',
          minWidth: 18,
        },
        nickname: {
          header: 'Nickname',
          minWidth: 16,
        },
        connectedOn: {
          header: 'Connected On',
          minWidth: 16,
        },
        accountUrl: {
          header: 'URL',
        },
        type: {
          header: 'Connection Type',
        },
      }, {
        printLine: this.log.bind(this),
      })

      await this.logSuccessAndExit()
      return
    }

    const config = await getSnowflakeConfig()
    const connections = Object.values(config?.connections ?? {}).map(conn => ({
      accountId: conn?.accountname,
      username: conn?.username,
      type: 'client-only',
    }))

    ux.table(connections, {
      accountId: {
        header: 'ID',
        minWidth: 18,
      },
      username: {
        header: 'Username',
      },
      type: {
        header: 'Connection Type',
      },
    }, {
      printLine: this.log.bind(this),
    })

    await this.logSuccessAndExit()
  }
}
