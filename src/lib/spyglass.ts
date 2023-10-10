import {Connection} from 'snowflake-sdk'
import {findIssues, getIssueDetail, Issue, IssueDetail} from './issues'
import {executeSqlCommands, fqDatabaseId, fqObjectId, fqSchemaId, getConn, listGrantsToRolesFullScan, ShowObject, showObjects, ShowUser, showUsers, showWarehouses, sqlCommandsFromYamlDiff} from './snowflake'
import {AppliedCommand, Entity, SqlCommand} from './sql'
import {diffYaml, Yaml, yamlFromRoleGrants, YamlRoleDefinitions} from './yaml'

export interface ImportArgs {
  accountId: string;
  onStart: (x: number) => void;
  onProgress: (x: number) => void;
}

export interface SyncArgs {
  yaml: Yaml;
  onStart: (total: number) => void;
  onProgress: (current: number) => void;
}

export interface CheckArgs {
  currentYaml: Yaml
  proposedYaml: Yaml
}

export interface CheckResult {
  notExistingEntities: Entity[]
}

export interface Spyglass {
  import(args: ImportArgs): Promise<Yaml>
  verify(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail>
  sync(args: SyncArgs): Promise<Yaml>
  apply(currentYaml: Yaml, proposedYaml: Yaml, dryRun: boolean): Promise<AppliedCommand[]>
  check(args: CheckArgs): Promise<CheckResult>
}

// mostly needed for test mocking purposes
export function newSpyglass(): Spyglass {
  return new SnowflakeSpyglass()
}

export interface SnowflakeSpyglassInit {
  conn?: Connection
}

export class SnowflakeSpyglass implements Spyglass {
  conn?: Connection

  constructor(init?: SnowflakeSpyglassInit) {
    this.conn = init?.conn
  }

  async import(args: ImportArgs): Promise<Yaml> {
    return importSnowflake(args, this.conn)
  }

  async verify(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail> {
    return verifySnowflake(yaml, issueId)
  }

  async sync(args: SyncArgs): Promise<Yaml> {
    return syncSnowflake(args, this.conn)
  }

  async apply(currentYaml: Yaml, proposedYaml: Yaml, dryRun: boolean): Promise<AppliedCommand[]> {
    return applySnowflake(currentYaml, proposedYaml, dryRun, this.conn)
  }

  async check(args: CheckArgs): Promise<CheckResult> {
    const notExistingEntities = await findNotExistingEntities(args.currentYaml, args.proposedYaml, this.conn)
    return {notExistingEntities}
  }
}

export async function importSnowflake({accountId, onStart, onProgress}: ImportArgs, conn?: Connection): Promise<Yaml> {
  if (!conn) {
    conn = await getConn(accountId)
  }

  const roleGrantsPromise = listGrantsToRolesFullScan(conn, onStart, onProgress)
  const warehousesRowsPromise = showWarehouses(conn)

  const allGrants = await roleGrantsPromise
  const warehouses = await warehousesRowsPromise

  const yaml = yamlFromRoleGrants(accountId, allGrants, warehouses)

  return yaml
}

export async function verifySnowflake(yaml: Yaml, issueId?: string): Promise<Issue[] | IssueDetail> {
  if (issueId) {
    return getIssueDetail(yaml, issueId)
  }

  return findIssues(yaml)
}

export async function syncSnowflake(args: SyncArgs, conn?: Connection): Promise<Yaml> {
  const latestYaml = await importSnowflake({accountId: args.yaml.spyglass.accountId, ...args}, conn)

  latestYaml.spyglass = structuredClone(args.yaml.spyglass)
  latestYaml.spyglass.lastSyncedMs = Date.now()

  return latestYaml
}

export async function applySnowflake(currentYaml: Yaml, proposedYaml: Yaml, dryRun: boolean, conn?: Connection): Promise<AppliedCommand[]> {
  if (!conn) {
    conn = await getConn(currentYaml.spyglass.accountId)
  }

  // Compute raw yaml differences.
  const yamlDiff = diffYaml(currentYaml, proposedYaml)

  // Convert differences to SQL commands.
  let appliedCommands: AppliedCommand[] = []
  const sqlCommandBatches = sqlCommandsFromYamlDiff(yamlDiff)

  // Execute the batches sequentially in order, because some queries may depend on others.
  for (const sqlCommands of sqlCommandBatches) {
    // eslint-disable-next-line no-await-in-loop
    const cmds = await executeSqlCommands(conn, sqlCommands, dryRun)

    // eslint-disable-next-line unicorn/prefer-spread
    appliedCommands = appliedCommands.concat(cmds)
  }

  return appliedCommands
}

export async function findNotExistingEntities(currentYaml: Yaml, proposedYaml: Yaml, conn?: Connection): Promise<Entity[]> {
  if (!conn) {
    conn = await getConn(currentYaml.spyglass.accountId)
  }

  const yamlDiff = diffYaml(currentYaml, proposedYaml)
  const sqlCommandBatches = sqlCommandsFromYamlDiff(yamlDiff)
  const sqlCommands = sqlCommandBatches.flat()

  const objects = await showObjects(conn)
  const users = await showUsers(conn)

  return _findNotExistingEntities(proposedYaml.roles, objects, users, sqlCommands)
}

const supportedNonExistingEntities = new Set(['DATABASE', 'SCHEMA', 'USER', 'ROLE', 'TABLE', 'VIEW'])

export function _findNotExistingEntities(proposedRoles: YamlRoleDefinitions | undefined, objects: ShowObject[], users: ShowUser[], sqlCommands: SqlCommand[]): Entity[] {
  let res: Entity[] = []

  const existingRoles = Object.keys(proposedRoles ?? {}).map(roleName => `ROLE:${roleName}`)
  const existingObjects = objects.map(o => `${o.kind}:${fqObjectId(o.database_name, o.schema_name, o.name)}`)
  const existingAccountObjects = getDatabasesAndSchemas(objects)
  const existingUsers = users.map(u => `USER:${u.name}`)
  const existingEntities = new Set([...existingRoles, ...existingObjects, ...existingAccountObjects, ...existingUsers])

  const proposedEntities = sqlCommands.map(x => x.entities)

  for (const entities of proposedEntities) {
    for (const entity of entities) {
      if (!supportedNonExistingEntities.has(entity.type)) {
        continue // not supported yet
      }

      // if we're deleting an object or revoking access to an object, and can't find that object
      // then likely it's already been deleted in some other process
      if (entity.action === 'delete') {
        continue
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
    res.add(`DATABASE:${fqDatabaseId(obj.database_name)}`)
    res.add(`SCHEMA:${fqSchemaId(obj.database_name, obj.schema_name)}`)
  }

  return [...res]
}

export class MockSpyglass implements Spyglass {
  _import?: Yaml
  _verify?: Issue[] | IssueDetail
  _sync?: Yaml
  _apply?: AppliedCommand[]
  _check?: CheckResult
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

  async check(_args: CheckArgs): Promise<CheckResult> {
    if (this._error) throw this._error
    if (!this._check) {
      throw new Error('mock check result not defined')
    }

    return this._check
  }
}
