import {findIssues, getIssueDetail, Issue, IssueDetail} from './issues'
import {AppliedCommand, executeCommands, getConn, listGrantsToRoles, listGrantsToUsers, showWarehouses, sqlCommandsFromYamlDiff} from './snowflake'
import {diffYaml, Yaml, yamlFromRoleGrants} from './yaml'

export async function importSnowflake(accountId: string): Promise<Yaml> {
  const conn = await getConn(accountId)
  const roleGrantsPromise = listGrantsToRoles(conn)
  const userGrantsPromise = listGrantsToUsers(conn)
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

export async function syncSnowflake(yaml: Yaml): Promise<Yaml> {
  const latestYaml = await importSnowflake(yaml.spyglass.accountId)

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
