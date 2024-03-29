import * as snowflake from '../../src/lib/snowflake'
import {expect} from 'chai'
import {PRIVILEGES, YamlRoles} from '../../src/lib/yaml'

describe('snowflake', () => {
  it('sanitizePrivilege accepts good privileges', async () => {
    for (const privilege of PRIVILEGES) {
      snowflake.sanitizePrivileges(privilege)
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
      expect(() => snowflake.sanitizePrivileges(privilege)).to.throw('invalid privilege')
    }
  })

  it('sanitizePrivilege rejects a list if any item is bad', async () => {
    const privileges = [...PRIVILEGES, 'end;']
    expect(() => snowflake.sanitizePrivileges(...privileges)).to.throw('invalid privilege')
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

  describe('normalizeAccountIds', () => {
    it('converts everything to lowercase', () => {
      const cfg: snowflake.Config = {
        connections: {
          'ACC-123': {
            accountname: 'aCC-123',
            username: 'tyty',
          },
        },
      }

      const newCfg = snowflake.normalizeAccountIds(cfg)

      expect(newCfg?.connections?.['ACC-123']).to.not.exist
      expect(newCfg?.connections?.['acc-123']).to.deep.equal({accountname: 'acc-123', username: 'tyty'})
    })
  })

  describe('query generation', () => {
    describe('basic grant', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'foo_usage', privileges: ['USAGE'], objectType: 'SCHEMA', objectId: 'foo.bar'})
        expect(cmd.query).to.deep.equal(['GRANT USAGE ON SCHEMA IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['foo.bar', 'foo_usage']])
        expect(cmd.entities).to.deep.equal([{type: 'ROLE', id: 'foo_usage', action: 'create'}, {type: 'SCHEMA', id: 'foo.bar', action: 'create'}])
      })
      it('generates revoke', () => {
        const cmd = snowflake.newRevokeQuery({roleName: 'foo_usage', privileges: ['USAGE'], objectType: 'SCHEMA', objectId: 'foo.bar'})
        expect(cmd.query).to.deep.equal(['REVOKE USAGE ON SCHEMA IDENTIFIER(?) FROM ROLE IDENTIFIER(?);', ['foo.bar', 'foo_usage']])
        expect(cmd.entities).to.deep.equal([{type: 'ROLE', id: 'foo_usage', action: 'delete'}, {type: 'SCHEMA', id: 'foo.bar', action: 'delete'}])
      })
    })

    describe('hierarchichal role grant', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'foo_usage', privileges: ['USAGE'], objectType: 'ROLE', objectId: 'bar_usage'})
        expect(cmd.query).to.deep.equal(['GRANT ROLE IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['bar_usage', 'foo_usage']])
      })
      it('generates revoke', () => {
        const cmd = snowflake.newRevokeQuery({roleName: 'foo_usage', privileges: ['USAGE'], objectType: 'ROLE', objectId: 'bar_usage'})
        expect(cmd.query).to.deep.equal(['REVOKE ROLE IDENTIFIER(?) FROM ROLE IDENTIFIER(?);', ['bar_usage', 'foo_usage']])
      })
    })

    describe('schema future grants', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'foo_bar_viewer', privileges: ['INSERT'], objectType: 'TABLE', objectId: 'foo.bar.<table>'})
        expect(cmd.query).to.deep.equal(['GRANT INSERT ON FUTURE TABLES IN SCHEMA IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['foo.bar', 'foo_bar_viewer']])
      })
      it('generates revoke', () => {
        const cmd = snowflake.newRevokeQuery({roleName: 'foo_bar_viewer', privileges: ['INSERT'], objectType: 'TABLE', objectId: 'foo.bar.<table>'})
        expect(cmd.query).to.deep.equal(['REVOKE INSERT ON FUTURE TABLES IN SCHEMA IDENTIFIER(?) FROM ROLE IDENTIFIER(?);', ['foo.bar', 'foo_bar_viewer']])
      })
    })

    describe('database future grants on tables', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'foo_viewer', privileges: ['INSERT'], objectType: 'TABLE', objectId: 'foo.<table>'})
        expect(cmd.query).to.deep.equal(['GRANT INSERT ON FUTURE TABLES IN DATABASE IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['foo', 'foo_viewer']])
      })
      it('generates revoke', () => {
        const cmd = snowflake.newRevokeQuery({roleName: 'foo_viewer', privileges: ['USAGE'], objectType: 'SCHEMA', objectId: 'foo.<schema>'})
        expect(cmd.query).to.deep.equal(['REVOKE USAGE ON FUTURE SCHEMAS IN DATABASE IDENTIFIER(?) FROM ROLE IDENTIFIER(?);', ['foo', 'foo_viewer']])
      })
    })

    describe('all tables in schema / database', () => {
      it('generates grant on all in schema', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'foo_bar_viewer', privileges: ['SELECT'], objectType: 'TABLE', objectId: 'foo.bar.*'})
        expect(cmd.query).to.deep.equal(['GRANT SELECT ON ALL TABLES IN SCHEMA IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['foo.bar', 'foo_bar_viewer']])
      })
      it('generates revoke on all in database', () => {
        const cmd = snowflake.newRevokeQuery({roleName: 'foo_viewer', privileges: ['SELECT'], objectType: 'TABLE', objectId: 'foo.*'})
        expect(cmd.query).to.deep.equal(['REVOKE SELECT ON ALL TABLES IN DATABASE IDENTIFIER(?) FROM ROLE IDENTIFIER(?);', ['foo', 'foo_viewer']])
      })
    })

    describe('role grants', () => {
      it('generates database role grant', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'FUNC_ROLE', privileges: ['USAGE'], objectType: 'DATABASE_ROLE', objectId: 'ACME.READER'})
        expect(cmd.query).to.deep.equal(['GRANT DATABASE ROLE IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['ACME.READER', 'FUNC_ROLE']])
      })

      it('generates normal role grant', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'FUNC_ROLE', privileges: ['USAGE'], objectType: 'ROLE', objectId: 'ACME_READER'})
        expect(cmd.query).to.deep.equal(['GRANT ROLE IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['ACME_READER', 'FUNC_ROLE']])
      })
    })

    describe('object types with underscore', () => {
      it('generates grant', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'FOO_READER', privileges: ['SELECT'], objectType: 'EXTERNAL_TABLE', objectId: 'FOO.BAR.BAZ'})
        expect(cmd.query).to.deep.equal(['GRANT SELECT ON EXTERNAL TABLE IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['FOO.BAR.BAZ', 'FOO_READER']])
        expect(cmd.entities).to.deep.equal([{type: 'ROLE', id: 'FOO_READER', action: 'create'}, {type: 'EXTERNAL TABLE', id: 'FOO.BAR.BAZ', action: 'create'}])
      })
    })

    describe('object types with underscore', () => {
      it('generates a grant with multiple privileges', () => {
        const cmd = snowflake.newGrantQuery({roleName: 'FOO_VIEWER', privileges: ['SELECT', 'INSERT', 'UPDATE'], objectType: 'TABLE', objectId: 'FOO.BAR.BAZ'})
        expect(cmd.query).to.deep.equal(['GRANT SELECT,INSERT,UPDATE ON TABLE IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['FOO.BAR.BAZ', 'FOO_VIEWER']])
        expect(cmd.entities).to.deep.equal([{type: 'ROLE', id: 'FOO_VIEWER', action: 'create'}, {type: 'TABLE', id: 'FOO.BAR.BAZ', action: 'create'}])
      })
    })
  })

  describe('normalizeRoleName', () => {
    it('keeps all caps role names', () => {
      expect(snowflake.normalizeRoleName('MY_ROLE')).to.equal('MY_ROLE')
    })

    it('preserves case and special characters in double-quotes', () => {
      expect(snowflake.normalizeRoleName('My - Role')).to.equal('"My - Role"')
    })

    it('doesn\'t double-quote if its run multiple times', () => {
      const res = snowflake.normalizeRoleName('My - Role')
      expect(snowflake.normalizeRoleName(res)).to.equal('"My - Role"')
    })
  })

  describe('getRoleGrantQueries', () => {
    it('succeeds in base case', () => {
      const yamlRoles: YamlRoles = {
        myRole: {USAGE: {DATABASE: ['acme']}},
      }
      const cmds = snowflake.getRoleGrantQueries(yamlRoles, true /* granted */)
      expect(cmds).to.have.length(1)
      expect(cmds[0].query).to.deep.equal(['GRANT USAGE ON DATABASE IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['acme', 'myRole']])
    })

    it('is forwards-compatible to unknown privileges', () => {
      const yamlRoles: YamlRoles = {
        myRole: {REBUILD: {TABLE: ['acme.prod.numbers']}},
      }
      const cmds = snowflake.getRoleGrantQueries(yamlRoles, true /* granted */)
      expect(cmds).to.have.length(1)
      expect(cmds[0].query).to.deep.equal(['GRANT REBUILD ON TABLE IDENTIFIER(?) TO ROLE IDENTIFIER(?);', ['acme.prod.numbers', 'myRole']])
    })

    it('handles empty object ids', () => {
      const yamlRoles = {myRole: {REBUILD: {TABLE: undefined}}} as any
      expect(snowflake.getRoleGrantQueries(yamlRoles)).to.deep.equal([])
    })

    it('handles empty privileges', () => {
      const yamlRoles = {myRole: {REBUILD: undefined}} as any
      expect(snowflake.getRoleGrantQueries(yamlRoles)).to.deep.equal([])
    })

    it('handles empty role', () => {
      const yamlRoles = {myRole: undefined} as any
      expect(snowflake.getRoleGrantQueries(yamlRoles)).to.deep.equal([])
    })

    it('handles empty yamlRoles', () => {
      expect(snowflake.getRoleGrantQueries({})).to.deep.equal([])
      expect(snowflake.getRoleGrantQueries()).to.deep.equal([])
    })
  })
})
