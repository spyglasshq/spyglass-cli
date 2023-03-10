import {findIssues, getIssueDetail, Issue, IssueDetail} from './issues'
import {executeCommands, getConn, listGrantsToRolesFullScan, listGrantsToUsersFullScan, showWarehouses, sqlCommandsFromYamlDiff} from './snowflake'
import {AppliedCommand} from './sql'
import {diffYaml, Yaml, yamlFromRoleGrants} from './yaml'

export async function importSnowflake(accountId: string, onStart: (x: number) => void, onProgress: (x: number) => void): Promise<Yaml> {
  const conn = await getConn(accountId)
  const roleGrantsPromise = listGrantsToRolesFullScan(conn, onStart, onProgress)
  const userGrantsPromise = listGrantsToUsersFullScan(conn) // Not implemented atm
  const warehousesRowsPromise = showWarehouses(conn)

  const grants = {
    roleGrants: await roleGrantsPromise,
    userGrants: await userGrantsPromise,
    warehouses: await warehousesRowsPromise,
  }

  return yamlFromRoleGrants(accountId, grants.roleGrants, grants.userGrants, grants.warehouses)
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
  const sqlDiff = sqlCommandsFromYamlDiff(yamlDiff)

  // TODO(tyler): do we need to fetch current objects in order to decide whether to create or alter?

  return executeCommands(currentYaml.spyglass.accountId, sqlDiff, dryRun)
}
