import {getConn, listGrantsToRoles, listGrantsToUsers, showWarehouses} from './snowflake'
import {Yaml, yamlFromRoleGrants} from './yaml'

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
