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

export interface Issue {
  id: string;
  issue: IssueType;
  category: string;
  data: DatabasePrivilege | SchemaPrivilege | WarehouseResize;
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

export interface IssueDetail extends Issue {
  yamlDiff: YamlDiff;
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
  }
}
