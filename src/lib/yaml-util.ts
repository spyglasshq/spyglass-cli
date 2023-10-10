import {YamlRole, YamlRoles} from './yaml'

interface ObjectIdIter {
  roleName: string;
  roleInfo: YamlRole;
  privilege: string;
  objectType: string;
  objectId: string;
}

export function forEachObjectInRoleGrants(roleGrants: YamlRoles, fn: (_: ObjectIdIter) => void): void {
  for (const [roleName, roleInfo] of Object.entries(roleGrants)) {
    for (const [privilege, objectLists] of Object.entries(roleInfo)) {
      for (const [objectType, objectIds] of Object.entries(objectLists ?? {})) {
        for (const objectId of objectIds) {
          fn({
            roleName,
            roleInfo,
            privilege,
            objectType,
            objectId,
          })
        }
      }
    }
  }
}
