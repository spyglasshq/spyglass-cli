import {findIssues, getIssueDetail, Issue, IssueDetail} from './issues'
import {Entity, executeCommands, getConn, listGrantsToRolesFullScan, listGrantsToUsersFullScan, showObjects, showRoles, showWarehouses, SqlCommand, sqlCommandsFromYamlDiff} from './snowflake'
import {AppliedCommand} from './sql'
import {diffYaml, Yaml, yamlFromRoleGrants} from './yaml'

export async function importSnowflake(accountId: string, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<Yaml> {
  const conn = await getConn(accountId)
  const roleGrantsPromise = listGrantsToRolesFullScan(conn, onStart, onProgress)
  const userGrantsPromise = listGrantsToUsersFullScan(conn) // Not implemented atm
  const warehousesRowsPromise = showWarehouses(conn)

  const [roleGrants, futureRoleGrants] = await roleGrantsPromise

  const grants = {
    roleGrants,
    futureRoleGrants,
    userGrants: await userGrantsPromise,
    warehouses: await warehousesRowsPromise,
  }

  return yamlFromRoleGrants(accountId, grants.roleGrants, grants.futureRoleGrants, grants.userGrants, grants.warehouses)
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

  const existingRoles = (await showRoles(conn)).map(r => `role:${r.name.toLowerCase()}`)
  const existingObjects = (await showObjects(conn)).map(o => `${o.kind.toLowerCase()}:${fqObjectId(o.database_name, o.schema_name, o.name)}`)
  const existingEntities = new Set([...existingRoles, ...existingObjects])

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

function fqObjectId(database: string, schema: string, objectId: string) {
  return [database.toLowerCase(), schema.toLowerCase(), objectId.toLowerCase()].join('.')
}
