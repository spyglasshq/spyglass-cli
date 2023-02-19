import {Yaml} from './yaml'

export interface UserAccess {
  username: string;
  objects: Record<string, unknown>[];
}

export interface Role {
  name: string;
  parents: string[];
}

export function userAccessFromYaml(yaml: Yaml, username: string): UserAccess {
  const res = {
    username,
    objects: new Array<Record<string, unknown>>(),
  }

  let rolesToDescend: Role[] = yaml.userGrants?.[username]?.roles?.map(name => ({name, parents: []})) ?? []

  for (;;) {
    const role = rolesToDescend.shift()
    if (!role) {
      break
    }

    // TYLER: check for infinite loop in yaml

    const inheritedRoleNames = yaml.roleGrants?.[role.name]?.usage?.role ?? []
    const inheritedRoles = inheritedRoleNames.map(name => ({name, parents: [...role.parents, role.name]}))
    rolesToDescend = [...rolesToDescend, ...inheritedRoles]

    for (const [privilege, objectLists] of Object.entries(yaml.roleGrants?.[role.name] ?? {})) {
      if (privilege === 'usage') {
        continue
      }

      for (const [objectType, objectIds] of Object.entries(objectLists)) {
        for (const objectId of objectIds) {
          res.objects.push({
            objectType,
            objectId,
            roleChain: [...role.parents, role.name],
          })
        }
      }
    }
  }

  return res
}

export interface UserRoles {
  username: string;
  roles: Role[];
}

export function userRolesFromYaml(yaml: Yaml, username: string): UserRoles {
  const res = {
    username,
    roles: new Array<Role>(),
  }

  let rolesToDescend: Role[] = yaml.userGrants?.[username]?.roles?.map(name => ({name, parents: []})) ?? []

  for (;;) {
    const role = rolesToDescend.shift()
    if (!role) {
      break
    }

    // TYLER: check for infinite loop in yaml

    const inheritedRoleNames = yaml.roleGrants?.[role.name]?.usage?.role ?? []
    const inheritedRoles = inheritedRoleNames.map(name => ({name, parents: [...role.parents, role.name]}))
    rolesToDescend = [...rolesToDescend, ...inheritedRoles]

    res.roles.push(role)
  }

  return res
}
