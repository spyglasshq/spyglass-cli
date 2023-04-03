import {sha256} from './crypto'
import {IssueType, ISSUES} from './issue-list'
import {mergeDeep} from './obj-merge'
import {fqSchemaId} from './snowflake'
import {diffYaml, Privilege, Yaml, YamlDiff} from './yaml'
import {forEachObjectInRoleGrants} from './yaml-util'

interface IssueHandlers {
  [id: string]: IssueHandler;
}

interface IssueHandler {
  fixYaml: (original: Yaml, data: unknown) => Yaml;
  findIssues: (yaml: Yaml) => Issue[];
}

export type IssueStatus = 'open' | 'resolved' | 'exempted'

export interface Issue {
  id?: string;
  issue: IssueType;
  data: DatabasePrivilege | SchemaPrivilege | WarehouseResize | RecreatedObjectAccess | SysadminMissingRole;
  status: IssueStatus;
}

export interface DatabasePrivilege {
  database: string;
  role: string;
  privilege: Privilege;
}

export interface SchemaPrivilege {
  schema: string;
  role: string;
  privilege: Privilege;
}

export interface WarehouseResize {
  warehouse: string;
  currentSize: string;
  recommendedSize: string;
}

export interface RecreatedObjectAccess {
  objectType: string;
  objectId: string;
  rolePermissions: [string, Privilege][];
}

export interface SysadminMissingRole {
  role: string;
}

export interface IssueDetail extends Issue {
  yamlDiff: YamlDiff;
  sqlCommands: string[];
}

export const ISSUE_HANDLERS: IssueHandlers = {
  SR1001: {
    fixYaml: (contents: Yaml, _data: unknown) => {
      const data = _data as DatabasePrivilege

      if (!contents.roleGrants[data.role][data.privilege]) {
        contents.roleGrants[data.role][data.privilege] = {}
      }

      // @ts-expect-error this will be created
      if (!contents.roleGrants[data.role][data.privilege].database) {
        // @ts-expect-error this will be created
        contents.roleGrants[data.role][data.privilege].database = []
      }

      // @ts-expect-error this will be created
      contents.roleGrants[data.role][data.privilege].database.push(data.database)

      return contents
    },

    findIssues: (yaml: Yaml): Issue[] => {
      const issues: Issue[] = []

      const roleDatabases: {[roleName: string]: Set<string>} = {}

      forEachObjectInRoleGrants(yaml.roleGrants, ({roleName, roleInfo, objectId}) => {
        const objectIdRx = /^\w*\.\w*\.\w*$/g // look for "db.schema.object" pattern
        const objectIdMatches = objectIdRx.exec(objectId)
        if (!objectIdMatches) {
          return
        }

        const [database] = objectId.split('.')

        if (!roleInfo.usage?.database?.includes(database)) {
          const schemas = roleDatabases[roleName] ?? new Set()
          schemas.add(database)
          roleDatabases[roleName] = schemas
        }
      })

      for (const [roleName, databases] of Object.entries(roleDatabases)) {
        for (const database of databases) {
          issues.push(newSR1001({role: roleName, database}))
        }
      }

      return issues
    },
  },

  SR1002: {
    fixYaml: (contents: Yaml, _data: unknown) => {
      const data = _data as SchemaPrivilege

      if (!contents.roleGrants[data.role][data.privilege]) {
        contents.roleGrants[data.role][data.privilege] = {}
      }

      // @ts-expect-error this will be created
      if (!contents.roleGrants[data.role][data.privilege].schema) {
        // @ts-expect-error this will be created
        contents.roleGrants[data.role][data.privilege].schema = []
      }

      // @ts-expect-error this will be created
      contents.roleGrants[data.role][data.privilege].schema.push(data.schema)

      return contents
    },

    findIssues: (yaml: Yaml): Issue[] => {
      const issues: Issue[] = []

      const roleSchemas: {[roleName: string]: Set<string>} = {}

      forEachObjectInRoleGrants(yaml.roleGrants, ({roleName, roleInfo, objectId}) => {
        const objectIdRx = /^\w*\.\w*\.\w*$/g // look for "db.schema.object" pattern
        const objectIdMatches = objectIdRx.exec(objectId)
        if (!objectIdMatches) {
          return
        }

        const [_database, _schema] = objectId.split('.')
        const schema = fqSchemaId(_database, _schema)

        if (!roleInfo.usage?.schema?.includes(schema)) {
          const schemas = roleSchemas[roleName] ?? new Set()
          schemas.add(schema)
          roleSchemas[roleName] = schemas
        }
      })

      for (const [roleName, schemas] of Object.entries(roleSchemas)) {
        for (const schema of schemas) {
          issues.push(newSR1002({role: roleName, schema}))
        }
      }

      return issues
    },
  },

  SR1003: {
    fixYaml: (contents: Yaml, _data: unknown) => {
      const data = _data as WarehouseResize

      contents.warehouses[data.warehouse].size = data.recommendedSize

      return contents
    },

    findIssues: (): Issue[] => {
      return []
    },
  },

  SR1005: {
    fixYaml: (contents: Yaml, _data: unknown) => {
      const data = _data as SysadminMissingRole

      const sysadminRoles = contents?.roleGrants?.sysadmin?.usage?.role ?? []

      sysadminRoles.push(data.role)

      const newYaml = {
        roleGrants: {
          sysadmin: {
            usage: {
              role: sysadminRoles,
            },
          },
        },
      }

      mergeDeep(contents, newYaml)

      return contents
    },

    findIssues: (yaml: Yaml): Issue[] => {
      const issues: Issue[] = []

      const sysadminRoles = new Set(yaml?.roleGrants?.sysadmin?.usage?.role ?? [])

      for (const roleName of Object.keys(yaml.roles ?? [])) {
        if (roleName === 'sysadmin') {
          continue
        }

        if (!sysadminRoles.has(roleName)) {
          issues.push(newSR1005({role: roleName}))
        }
      }

      return issues
    },
  },

  SR1008: {
    fixYaml: (contents: Yaml, _data: unknown) => {
      return contents
    },

    findIssues: (): Issue[] => {
      return []
    },
  },
}

export async function findIssues(yaml: Yaml): Promise<Issue[]> {
  let issues: Issue[] = []

  for (const issueHandler of Object.values(ISSUE_HANDLERS)) {
    issues = [...issues, ...issueHandler.findIssues(yaml)]
  }

  for (const issue of issues) {
    // eslint-disable-next-line no-await-in-loop
    issue.id = (await sha256(issue.data)).slice(0, 12)
  }

  return issues.sort((a, b) => (a.id ?? 0) > (b.id ?? 0) ? -1 : 1)
}

export async function getIssueDetail(yaml: Yaml, issueId: string): Promise<IssueDetail> {
  const issues = await findIssues(yaml)
  const foundIssue = issues.filter(issue => issue.id === issueId)
  if (!foundIssue || foundIssue.length === 0) {
    throw new Error('issue not found')
  }

  const issue = foundIssue[0]
  const yamlDiff = getYamlDiff(yaml, issue)
  const sqlCommands: string[] = []

  return {
    yamlDiff,
    sqlCommands,
    ...issue,
  }
}

export function getYamlDiff(current: Yaml, issue: Issue): YamlDiff {
  const currentCopy = JSON.parse(JSON.stringify(current))
  const proposed = ISSUE_HANDLERS[issue.issue.id]?.fixYaml(currentCopy, issue.data) ?? currentCopy
  return diffYaml(current, proposed)
}

export function newSR1001({role, database}: {role: string, database: string}): Issue {
  return {
    issue: ISSUES.SR1001,
    data: {
      role,
      privilege: 'usage',
      database,
    } as DatabasePrivilege,
    status: 'open',
  }
}

export function newSR1002({role, schema}: {role: string, schema: string}): Issue {
  return {
    issue: ISSUES.SR1002,
    data: {
      role,
      privilege: 'usage',
      schema,
    } as SchemaPrivilege,
    status: 'open',
  }
}

export function newSR1005({role}: {role: string}): Issue {
  return {
    issue: ISSUES.SR1005,
    data: {
      role,
    } as SysadminMissingRole,
    status: 'open',
  }
}
