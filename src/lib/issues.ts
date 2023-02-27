import {webcrypto} from 'node:crypto'
import {IssueType, ISSUES} from './issue-list'
import {diffYaml, Yaml, YamlDiff} from './yaml'

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
  data: DatabasePrivilege | SchemaPrivilege | WarehouseResize | RecreatedObjectAccess;
  status: IssueStatus;
}

export interface DatabasePrivilege {
  database: string;
  role: string;
  privilege: string;
}

export interface SchemaPrivilege {
  schema: string;
  role: string;
  privilege: string;
}

export interface WarehouseResize {
  warehouse: string;
  currentSize: string;
  recommendedSize: string;
}

export interface RecreatedObjectAccess {
  objectType: string;
  objectId: string;
  rolePermissions: [string, string][];
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

      if (!contents.roleGrants[data.role][data.privilege].database) {
        contents.roleGrants[data.role][data.privilege].database = []
      }

      contents.roleGrants[data.role][data.privilege].database.push(data.database)

      return contents
    },

    findIssues: (yaml: Yaml): Issue[] => {
      const issues: Issue[] = []

      // TODO(tyler): make this work for all objects (not just views) and all privs (not just select)

      for (const [roleName, role] of Object.entries(yaml.roleGrants)) {
        for (const objectId of (role?.select?.view ?? [])) {
          const [database] = objectId.split('.')
          if (!role.usage?.database?.includes(database)) {
            issues.push({
              issue: ISSUES.SR1001,
              data: {
                role: roleName,
                privilege: 'usage',
                database,
              },
              status: 'open',
            })
          }
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

  SR1008: {
    fixYaml: (contents: Yaml, _data: unknown) => {
      const data = _data as RecreatedObjectAccess

      for (const [role, permission] of data.rolePermissions) {
        if (!contents.roleGrants[role][permission]) {
          contents.roleGrants[role][permission] = {}
        }

        if (!contents.roleGrants[role][permission][data.objectType]) {
          contents.roleGrants[role][permission][data.objectType] = []
        }

        contents.roleGrants[role][permission][data.objectType].push(data.objectId)
      }

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

async function sha256(obj: unknown): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(obj))
  const hash = await webcrypto.subtle.digest('SHA-256', data)
  const hashArray = [...new Uint8Array(hash)]
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function getIssueDetail(yaml: Yaml, issueId: string): Promise<IssueDetail> {
  const issues = await findIssues(yaml)
  const foundIssue = issues.filter(issue => issue.id === issueId)
  if (!foundIssue || foundIssue.length === 0) {
    throw new Error('issue not found')
  }

  const issue = foundIssue[0];
  const yamlDiff = getYamlDiff(yaml, issue)
  const sqlCommands: string[] = []

  return {
    yamlDiff,
    sqlCommands,
    ...issue,
  }
}

function getYamlDiff(current: Yaml, issue: Issue): YamlDiff {
  const currentCopy = JSON.parse(JSON.stringify(current));
  const proposed = ISSUE_HANDLERS[issue.issue.id]?.fixYaml(currentCopy, issue.data) ?? currentCopy;
  return diffYaml(current, proposed)
}
