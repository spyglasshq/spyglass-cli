import {Yaml, YamlDiff} from './yaml'

interface IssueHandlers {
  [id: string]: IssueHandler;
}

interface IssueHandler {
  fixYaml: (original: Yaml, data: unknown) => Yaml;
}

export interface IssueType {
  id: string;
  name: string;
}

export type IssueStatus = 'open' | 'resolved' | 'exempted'

export interface Issue {
  id: string;
  issue: IssueType;
  category: string;
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
  },

  SR1003: {
    fixYaml: (contents: Yaml, _data: unknown) => {
      const data = _data as WarehouseResize

      contents.warehouses[data.warehouse].size = data.recommendedSize

      return contents
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

        contents.roleGrants[role][permission][data.objectType].push(data.objectId);
      }

      return contents
    },
  },
}
