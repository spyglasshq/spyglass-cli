/* eslint-disable camelcase */
import * as spyglass from '../../src/lib/spyglass'
import * as snowflake from '../../src/lib/snowflake'
import {expect, test} from '@oclif/test'
import {readJSON} from 'fs-extra'

const noopFunc = () => null

describe('SnowflakeSpyglass', () => {
  const spyg = new spyglass.SnowflakeSpyglass()

  describe('import', () => {
    test
    .stub(snowflake, 'getConn', () => null)
    .stub(snowflake, 'listGrantsToRolesFullScan', () => readJSON('test/testdata/spyglass-import-snowflake-stub-basic.json'))
    .stub(snowflake, 'showWarehouses', () => ([]))
    .it('succeeds', async () => {
      const yaml = await spyg.import('account-123', noopFunc, noopFunc)

      expect(yaml.roleGrants).to.deep.equal({
        acme_prod_call_center_reader: {
          select: {
            view: ['acme.prod.call_center'],
          },
          usage: {
            database: ['acme'],
            schema: ['acme.prod'],
          },
        },
        acme_prod_all_tables_viewer: {
          select: {
            table: ['acme.prod.<table>'],
          },
        },
        customer_support: {
          usage: {
            role: ['acme_prod_call_center_reader'],
          },
        },
      })

      expect(yaml.userGrants).to.deep.equal({
        chuck_support: {
          roles: ['customer_support'],
        },
        alice_admin: {
          roles: ['acme_prod_all_tables_viewer'],
        },
      })
    })
  })
})
