import * as snowflake from '../../src/lib/snowflake'
import {expect} from 'chai'
import {PRIVILEGES} from '../../src/lib/yaml'

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
})
