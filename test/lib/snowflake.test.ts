/* eslint-disable camelcase */
import * as snowflake from '../../src/lib/snowflake'
import {compressYaml} from '../../src/lib/snowflake-yaml-compress'
import {expect} from 'chai'
import {Yaml, PRIVILEGES, YamlRoles} from '../../src/lib/yaml'

describe('snowflake', () => {
  it('sanitizePrivilege accepts good privileges', async () => {
    for (const privilege of PRIVILEGES) {
      snowflake.sanitizePrivilege(privilege)
    }
  })

  it('sanitizePrivilege rejects invalid privileges', async () => {
    const invalidPrivileges = [
      'usage\'',
      'end;',
      'some ^ priv',
      'blah "',
    ]

    for (const privilege of invalidPrivileges) {
      expect(() => snowflake.sanitizePrivilege(privilege)).to.throw('invalid privilege')
    }
  })

  it('sanitizeObject accepts good privileges', async () => {
    const objectTypes = [
      'role',
      'database',
      'schema',
      'table',
    ]
    for (const objectType of objectTypes) {
      snowflake.sanitizeObjectType(objectType)
    }
  })

  it('sanitizeObject rejects invalid privileges', async () => {
    const invalidObjectTypes = [
      'role\'',
      'end;',
      'some ^ obj',
      'blah "',
    ]

    for (const objectType of invalidObjectTypes) {
      expect(() => snowflake.sanitizeObjectType(objectType)).to.throw('invalid object type')
    }
  })

  describe('query generation', () => {
    describe('basic grant', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery('foo_usage', 'usage', 'schema', 'foo.bar')
        expect(cmd.query).to.deep.equal(['grant usage on schema identifier(?) to role identifier(?);', ['foo.bar', 'foo_usage']])
      })
      it('generates revoke', () => {
        const cmd = snowflake.newRevokeQuery('foo_usage', 'usage', 'schema', 'foo.bar')
        expect(cmd.query).to.deep.equal(['revoke usage on schema identifier(?) from role identifier(?);', ['foo.bar', 'foo_usage']])
      })
    })

    describe('hierarchichal role grant', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery('foo_usage', 'usage', 'role', 'bar_usage')
        expect(cmd.query).to.deep.equal(['grant role identifier(?) to role identifier(?);', ['bar_usage', 'foo_usage']])
      })
      it('generates revoke', () => {
        const cmd = snowflake.newRevokeQuery('foo_usage', 'usage', 'role', 'bar_usage')
        expect(cmd.query).to.deep.equal(['revoke role identifier(?) from role identifier(?);', ['bar_usage', 'foo_usage']])
      })
    })

    describe('schema future grants', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery('foo_bar_viewer', 'insert', 'table', 'foo.bar.<table>')
        expect(cmd.query).to.deep.equal(['grant insert on future tables in schema identifier(?) to role identifier(?);', ['foo.bar', 'foo_bar_viewer']])
      })
      it('generates revoke', () => {
        const cmd = snowflake.newRevokeQuery('foo_bar_viewer', 'insert', 'table', 'foo.bar.<table>')
        expect(cmd.query).to.deep.equal(['revoke insert on future tables in schema identifier(?) from role identifier(?);', ['foo.bar', 'foo_bar_viewer']])
      })
    })

    describe('database future grants on tables', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery('foo_viewer', 'insert', 'table', 'foo.<table>')
        expect(cmd.query).to.deep.equal(['grant insert on future tables in database identifier(?) to role identifier(?);', ['foo', 'foo_viewer']])
      })
      it('generates revoke', () => {
        const cmd = snowflake.newRevokeQuery('foo_viewer', 'usage', 'schema', 'foo.<schema>')
        expect(cmd.query).to.deep.equal(['revoke usage on future schemas in database identifier(?) from role identifier(?);', ['foo', 'foo_viewer']])
      })
    })

    describe('all tables in schema / database', () => {
      it('generates grant on all in schema', () => {
        const cmd = snowflake.newGrantQuery('foo_bar_viewer', 'select', 'table', 'foo.bar.*')
        expect(cmd.query).to.deep.equal(['grant select on all tables in schema identifier(?) to role identifier(?);', ['foo.bar', 'foo_bar_viewer']])
      })
      it('generates revoke on all in database', () => {
        const cmd = snowflake.newRevokeQuery('foo_viewer', 'select', 'table', 'foo.*')
        expect(cmd.query).to.deep.equal(['revoke select on all tables in database identifier(?) from role identifier(?);', ['foo', 'foo_viewer']])
      })
    })
  })

  describe('compressYaml', () => {
    const objects: snowflake.ShowObject[] = [
      newObject('table1', 'db1', 'schema1', 'table'),
      newObject('table2', 'db1', 'schema1', 'table'),
      newObject('table3', 'db1', 'schema1', 'table'),
      newObject('table1', 'db1', 'schema2', 'table'),
      newObject('table1', 'db2', 'schema1', 'table'),
      newObject('table2', 'db2', 'schema1', 'table'),
      newObject('table1', 'db2', 'schema2', 'table'),
      newObject('table2', 'db2', 'schema2', 'table'),
      newObject('table1', 'db2', 'schema3', 'table'),
      newObject('table2', 'db2', 'schema3', 'table'),
    ]

    it('replaces a list of tables with a wildcard', async () => {
      const yaml = newYamlWithRole(
        [
          'db1.schema1.table1',
          'db1.schema1.table2',
          'db1.schema1.table3',
        ],
        ['db1'],
        ['db1.schema1'],
      )

      const mockObjects = objects.filter(o => o.schema_name === 'schema1' && o.database_name === 'db1')

      compressYaml(yaml, mockObjects)

      expect(yaml.roleGrants.dataViewer?.select?.table).to.deep.equal(['db1.*'])
      expect(yaml.roleGrants.dataViewer?.usage?.schema).to.deep.equal(['db1.*'])
    })

    it('replaces a list of tables with a wildcard, preserving future grants', async () => {
      const yaml = newYamlWithRole(
        [
          'db1.schema1.<table>',
          'db1.schema1.table1',
          'db1.schema1.table2',
          'db1.schema1.table3',
        ],
        ['db1'],
        ['db1.schema1'],
      )

      const mockObjects = objects.filter(o => o.schema_name === 'schema1' && o.database_name === 'db1')

      compressYaml(yaml, mockObjects)

      expect(yaml.roleGrants.dataViewer?.select?.table).to.deep.equal(['db1.*', 'db1.schema1.<table>'])
      expect(yaml.roleGrants.dataViewer?.usage?.schema).to.deep.equal(['db1.*'])
    })

    it('replaces a list of tables with a wildcard when there are more schemas', async () => {
      const yaml = newYamlWithRole(
        [
          'db1.schema1.<table>',
          'db1.schema1.table1',
          'db1.schema1.table2',
          'db1.schema1.table3',
        ],
        ['db1'],
        ['db1.schema1'],
      )

      const mockObjects = objects.filter(o => o.database_name === 'db1')

      compressYaml(yaml, mockObjects)

      expect(yaml.roleGrants.dataViewer?.select?.table).to.deep.equal(['db1.schema1.*', 'db1.schema1.<table>'])
      expect(yaml.roleGrants.dataViewer?.usage?.schema).to.deep.equal(['db1.schema1'])
    })

    it('doesnt compress if we dont have all tables in a schema', async () => {
      const yaml = newYamlWithRole(
        [
          'db1.schema1.<table>',
          'db1.schema1.table1',
          'db1.schema1.table3',
        ],
        ['db1'],
        ['db1.schema1', 'db1.schema2'],
      )

      const mockObjects = objects.filter(o => o.database_name === 'db1' && o.schema_name === 'schema1')

      compressYaml(yaml, mockObjects)

      expect(yaml.roleGrants.dataViewer?.select?.table).to.deep.equal(['db1.schema1.<table>', 'db1.schema1.table1', 'db1.schema1.table3'])
      expect(yaml.roleGrants.dataViewer?.usage?.schema).to.deep.equal(['db1.*'])
    })

    it('compresses if we have all tables in all databases and schemas', async () => {
      const yaml = newYamlWithRole(
        [
          'db1.<schema>',
          'db1.schema1.table1',
          'db1.schema1.table2',
          'db1.schema1.table3',
          'db1.schema2.table1',
          'db2.schema1.table1',
          'db2.schema1.table2',
          'db2.schema2.table1',
          'db2.schema2.table2',
          'db2.schema3.table1',
          'db2.schema3.table2',
        ],
        ['db1', 'db2'],
        ['db1.schema1', 'db1.schema2', 'db2.schema1', 'db2.schema2', 'db2.schema3'],
      )

      const mockObjects = objects

      compressYaml(yaml, mockObjects)

      expect(yaml.roleGrants.dataViewer?.select?.table).to.deep.equal(['db1.*', 'db1.<schema>', 'db2.*'])
      expect(yaml.roleGrants.dataViewer?.usage?.schema).to.deep.equal(['db1.*', 'db2.*'])
    })

    it('partially compresses if we have all tables in all databases and some schemas', async () => {
      const yaml = newYamlWithRole(
        [
          'db1.<schema>',
          'db1.schema1.table1',
          'db1.schema1.table2',
          'db1.schema1.table3',
          'db1.schema2.table1',
          'db2.schema1.table1',
          'db2.schema1.table2',
          'db2.schema2.table1',
          'db2.schema2.table2',
        ],
        ['db1', 'db2'],
        ['db1.schema1', 'db1.schema2', 'db2.schema1', 'db2.schema2'],
      )

      const mockObjects = objects

      compressYaml(yaml, mockObjects)

      expect(yaml.roleGrants.dataViewer?.select?.table).to.deep.equal(['db1.*', 'db1.<schema>', 'db2.schema1.*', 'db2.schema2.*'])
      expect(yaml.roleGrants.dataViewer?.usage?.schema).to.deep.equal(['db1.*', 'db2.schema1', 'db2.schema2'])
    })
  })
})

function newYaml(roleGrants: YamlRoles): Yaml {
  return {
    roleGrants,
    warehouses: {},
    userGrants: {},
    spyglass: {
      accountId: 'account-123',
      platform: 'snowflake',
      version: 1,
      lastSyncedMs: Date.now(),
    },
  }
}

function newYamlWithRole(table: string[], database: string[], schema: string[]): Yaml {
  return newYaml({
    dataViewer: {
      select: {
        table,
      },
      usage: {
        database,
        schema,
      },
    },
  })
}

function newObject(name: string, database: string, schema: string, kind: string): snowflake.ShowObject {
  return {
    name,
    kind,
    database_name: database,
    schema_name: schema,
  }
}
