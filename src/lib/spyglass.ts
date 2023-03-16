import {findIssues, getIssueDetail, Issue, IssueDetail} from './issues'
import {Entity, executeCommands, getConn, listGrantsToRolesFullScan, ShowObject, showObjects, showRoles, showWarehouses, SqlCommand, sqlCommandsFromYamlDiff} from './snowflake'
import {AppliedCommand} from './sql'
import {diffYaml, Yaml, yamlFromRoleGrants} from './yaml'

export interface Spyglass {
  import(accountId: string, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<Yaml>
  verify(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail>
  sync(yaml: Yaml, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<Yaml>
  apply(currentYaml: Yaml, proposedYaml: Yaml, dryRun: boolean): Promise<AppliedCommand[]>
}

// mostly needed for test mocking purposes
export function newSpyglass(): Spyglass {
  return new SnowflakeSpyglass()
}

export class SnowflakeSpyglass {
  async import(accountId: string, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<Yaml> {
    return importSnowflake(accountId, onStart, onProgress)
  }

  async verify(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail> {
    return verifySnowflake(yaml, issueId)
  }

  async sync(yaml: Yaml, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<Yaml> {
    return syncSnowflake(yaml, onStart, onProgress)
  }

  async apply(currentYaml: Yaml, proposedYaml: Yaml, dryRun: boolean): Promise<AppliedCommand[]> {
    return applySnowflake(currentYaml, proposedYaml, dryRun)
  }
}

export async function importSnowflake(accountId: string, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<Yaml> {
  const conn = await getConn(accountId)
  const roleGrantsPromise = listGrantsToRolesFullScan(conn, onStart, onProgress)
  const warehousesRowsPromise = showWarehouses(conn)

  const [roleGrants, futureRoleGrants, roleGrantsOf] = await roleGrantsPromise

  const grants = {
    roleGrants,
    futureRoleGrants,
    roleGrantsOf,
    warehouses: await warehousesRowsPromise,
  }

  return yamlFromRoleGrants(accountId, grants.roleGrants, grants.futureRoleGrants, grants.roleGrantsOf, grants.warehouses)
}

export async function verifySnowflake(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail> {
  if (issueId) {
    return getIssueDetail(yaml, issueId)
  }

  return findIssues(yaml)
}

export async function syncSnowflake(yaml: Yaml, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<Yaml> {
  const latestYaml = await importSnowflake(yaml.spyglass.accountId, onStart, onProgress)

  latestYaml.spyglass = yaml.spyglass
  latestYaml.spyglass.lastSyncedMs = Date.now()

  return latestYaml
}

export async function applySnowflake(currentYaml: Yaml, proposedYaml: Yaml, dryRun: boolean): Promise<AppliedCommand[]> {
  // Compute raw yaml differences.
  const yamlDiff = diffYaml(currentYaml, proposedYaml)

  // Convert differences to SQL commands.
  const sqlCommands = sqlCommandsFromYamlDiff(yamlDiff)
  const sqlDiff = sqlCommands.map(x => x.query)

  return executeCommands(currentYaml.spyglass.accountId, sqlDiff, dryRun)
}

export async function findNotExistingEntities(currentYaml: Yaml, proposedYaml: Yaml): Promise<Entity[]> {
  const yamlDiff = diffYaml(currentYaml, proposedYaml)
  const sqlCommands = sqlCommandsFromYamlDiff(yamlDiff)
  return _findNotExistingEntities(currentYaml.spyglass.accountId, sqlCommands)
}

async function _findNotExistingEntities(accountId: string, sqlCommands: SqlCommand[]): Promise<Entity[]> {
  let res: Entity[] = []

  const conn = await getConn(accountId)

  const roles = await showRoles(conn)
  const objects = await showObjects(conn)

  const existingRoles = roles.map(r => `role:${r.name.toLowerCase()}`)
  const existingObjects = objects.map(o => `${o.kind.toLowerCase()}:${fqObjectId(o.database_name, o.schema_name, o.name)}`)
  const existingAccountObjects = getDatabasesAndSchemas(objects)
  const existingEntities = new Set([...existingRoles, ...existingObjects, ...existingAccountObjects])

  const proposedEntities = sqlCommands.map(x => x.entities)

  for (const entities of proposedEntities) {
    for (const entity of entities) {
      if (!existingEntities.has(`${entity.type}:${entity.id}`)) {
        res = [...res, entity]
      }
    }
  }

  return res
}

function fqObjectId(database: string, schema: string, objectId: string): string {
  return [database.toLowerCase(), schema.toLowerCase(), objectId.toLowerCase()].join('.')
}

function fqSchemaId(database: string, schema: string): string {
  return [database.toLowerCase(), schema.toLowerCase()].join('.')
}

function fqDatabaseId(database: string): string {
  return database.toLowerCase()
}

function getDatabasesAndSchemas(objects: ShowObject[]): string[] {
  const res: Set<string> = new Set()

  for (const obj of objects) {
    res.add(`database:${fqDatabaseId(obj.database_name)}`)
    res.add(`schema:${fqSchemaId(obj.database_name, obj.schema_name)}`)
  }

  return [...res]
}

export class MockSpyglass {
  _import?: Yaml
  _verify?: Issue[] | IssueDetail
  _sync?: Yaml
  _apply?: AppliedCommand[]
  _error?: Error

  async import(_accountId: string, _onStart: (x: number) => void, _onProgress: (x: number) => void): Promise<Yaml> {
    if (this._error) throw this._error
    if (!this._import) {
      throw new Error('mock import result not defined')
    }

    return this._import
  }

  async verify(_yaml: Yaml, _issueId?: string): Promise<Issue[] | IssueDetail> {
    if (this._error) throw this._error
    if (!this._verify) {
      throw new Error('mock verify result not defined')
    }

    return this._verify
  }

  async sync(_yaml: Yaml, _onStart: (x: number) => void, _onProgress: (x: number) => void): Promise<Yaml> {
    if (this._error) throw this._error
    if (!this._sync) {
      throw new Error('mock sync result not defined')
    }

    return this._sync
  }

  async apply(_currentYaml: Yaml, _proposedYaml: Yaml, _dryRun: boolean): Promise<AppliedCommand[]> {
    if (this._error) throw this._error
    if (!this._apply) {
      throw new Error('mock apply result not defined')
    }

    return this._apply
  }
}
