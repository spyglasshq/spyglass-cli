import {Command, ux} from '@oclif/core'
import color from '@oclif/color';

export default class List extends Command {
  static description = 'List acccounts.'

  async run(): Promise<void> {
    const accounts = [
      {
        accountId: 'zhjgixi-tv26532',
        accountUrl: 'https://qe39554.us-central1.gcp.snowflakecomputing.com',
        connectedOn: '1/31/2023',
        nickname: 'Production',
      },
      {
        accountId: 'zryewvz-yi01408',
        accountUrl: 'https://xd81502.us-central1.gcp.snowflakecomputing.com',
        connectedOn: '12/27/2022',
        nickname: 'Staging',
      },
      {
        accountId: 'oembzjb-qv08311',
        accountUrl: 'https://oc81182.us-central1.gcp.snowflakecomputing.com',
        connectedOn: '12/27/2022',
        nickname: 'Development',
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
    }, {
      printLine: this.log.bind(this),
    })
  }
}
