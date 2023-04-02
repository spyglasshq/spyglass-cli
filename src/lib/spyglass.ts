import {findIssues, getIssueDetail, Issue, IssueDetail} from './issues'
import {Entity, executeCommands, fqDatabaseId, fqObjectId, fqSchemaId, getConn, listGrantsToRolesFullScan, ShowObject, showObjects, showRoles, showUsers, showWarehouses, SqlCommand, sqlCommandsFromYamlDiff} from './snowflake'
import {compressYaml} from './snowflake-yaml-compress'
import {AppliedCommand} from './sql'
import {diffYaml, Yaml, yamlFromRoleGrants} from './yaml'

export interface ImportArgs {
  accountId: string;
  onStart: (x: number) => void;
  onProgress: (x: number) => void;
  compress?: boolean;
}

export interface SyncArgs {
  yaml: Yaml;
  onStart: (x: number) => void;
  onProgress: (x: number) => void;
}

export interface Spyglass {
  import(args: ImportArgs): Promise<Yaml>
  verify(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail>
  sync(args: SyncArgs): Promise<Yaml>
  apply(currentYaml: Yaml, proposedYaml: Yaml, dryRun: boolean): Promise<AppliedCommand[]>
}

// mostly needed for test mocking purposes
export function newSpyglass(): Spyglass {
  return new SnowflakeSpyglass()
}

export class SnowflakeSpyglass implements Spyglass {
  async import(args: ImportArgs): Promise<Yaml> {
    return importSnowflake(args)
  }

  async verify(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail> {
    return verifySnowflake(yaml, issueId)
  }

  async sync(args: SyncArgs): Promise<Yaml> {
    return syncSnowflake(args)
  }

  async apply(currentYaml: Yaml, proposedYaml: Yaml, dryRun: boolean): Promise<AppliedCommand[]> {
    return applySnowflake(currentYaml, proposedYaml, dryRun)
  }
}

export async function importSnowflake({accountId, onStart, onProgress, compress}: ImportArgs): Promise<Yaml> {
  const conn = await getConn(accountId)
  const roleGrantsPromise = listGrantsToRolesFullScan(conn, onStart, onProgress)
  const warehousesRowsPromise = showWarehouses(conn)

  const [roleGrants, futureRoleGrants, roleGrantsOf, roles] = await roleGrantsPromise

  const grants = {
    roleGrants,
    futureRoleGrants,
    roleGrantsOf,
    roles,
    warehouses: await warehousesRowsPromise,
  }

  const yaml = yamlFromRoleGrants(accountId, grants.roleGrants, grants.futureRoleGrants, grants.roleGrantsOf, grants.warehouses, grants.roles)

  if (compress) {
    yaml.spyglass.compressRecords = true
    const objects = await showObjects(conn)
    compressYaml(yaml, objects)
  }

  return yaml
}

export async function verifySnowflake(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail> {
  if (issueId) {
    return getIssueDetail(yaml, issueId)
  }

  return findIssues(yaml)
}

export async function syncSnowflake(args: SyncArgs): Promise<Yaml> {
  const latestYaml = await importSnowflake({accountId: args.yaml.spyglass.accountId, compress: args.yaml.spyglass?.compressRecords, ...args})

  latestYaml.spyglass = args.yaml.spyglass
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
  const users = await showUsers(conn)

  const existingRoles = roles.map(r => `role:${r.name.toLowerCase()}`)
  const existingObjects = objects.map(o => `${o.kind.toLowerCase()}:${fqObjectId(o.database_name, o.schema_name, o.name)}`)
  const existingAccountObjects = getDatabasesAndSchemas(objects)
  const existingUsers = users.map(u => `user:${u.name.toLowerCase()}`)
  const existingEntities = new Set([...existingRoles, ...existingObjects, ...existingAccountObjects, ...existingUsers])

  const proposedEntities = sqlCommands.map(x => x.entities)

  for (const entities of proposedEntities) {
    for (const entity of entities) {
      if (entity.type === 'warehouse' || entity.type === 'database_role') {
        continue // not supported yet
      }

      if (!existingEntities.has(`${entity.type}:${entity.id}`)) {
        res = [...res, entity]
      }
    }
  }

  return res
}

function getDatabasesAndSchemas(objects: ShowObject[]): string[] {
  const res: Set<string> = new Set()

  for (const obj of objects) {
    res.add(`database:${fqDatabaseId(obj.database_name)}`)
    res.add(`schema:${fqSchemaId(obj.database_name, obj.schema_name)}`)
  }

  return [...res]
}

export class MockSpyglass implements Spyglass {
  _import?: Yaml
  _verify?: Issue[] | IssueDetail
  _sync?: Yaml
  _apply?: AppliedCommand[]
  _error?: Error

  async import(_args: ImportArgs): Promise<Yaml> {
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

  async sync(_args: SyncArgs): Promise<Yaml> {
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
