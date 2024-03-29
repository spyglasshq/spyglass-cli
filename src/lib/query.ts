/* eslint-disable max-depth */
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
  username = username.toLowerCase()

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

    const inheritedRoleNames = yaml.roleGrants?.[role.name]?.USAGE?.role ?? []
    const inheritedRoles = inheritedRoleNames.map(name => ({name, parents: [...role.parents, role.name]}))
    rolesToDescend = [...rolesToDescend, ...inheritedRoles]

    for (const [privilege, objectLists] of Object.entries(yaml.roleGrants?.[role.name] ?? {})) {
      for (const [objectType, objectIds] of Object.entries(objectLists ?? {})) {
        if (privilege === 'USAGE' && objectType === 'ROLE') {
          continue
        }

        for (const objectId of objectIds) {
          res.objects.push({
            objectType,
            objectId,
            privilege,
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
  username = username.toLowerCase()

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

    const inheritedRoleNames = yaml.roleGrants?.[role.name]?.USAGE?.role ?? []
    const inheritedRoles = inheritedRoleNames.map(name => ({name, parents: [...role.parents, role.name]}))
    rolesToDescend = [...rolesToDescend, ...inheritedRoles]

    res.roles.push(role)
  }

  return res
}

export interface ObjectAccess {
  objectId: string;
  users: Record<string, unknown>[];
}

export function objectAccessFromYaml(yaml: Yaml, targetObjectId: string): ObjectAccess {
  targetObjectId = targetObjectId.toLowerCase()

  const res = {
    objectId: targetObjectId,
    users: new Array<Record<string, unknown>>(),
  }

  const rolesToUsers = getRolesToUsersIndex(yaml)

  let rolesToDescend: Role[] = Object.keys(yaml.roleGrants).map(name => ({name, parents: []})) ?? []

  for (;;) {
    const role = rolesToDescend.shift()
    if (!role) {
      break
    }

    // TYLER: check for infinite loop in yaml

    const inheritedRoleNames = yaml.roleGrants?.[role.name]?.USAGE?.role ?? []
    const inheritedRoles = inheritedRoleNames.map(name => ({name, parents: [...role.parents, role.name]}))
    rolesToDescend = [...rolesToDescend, ...inheritedRoles]

    for (const [privilege, objectLists] of Object.entries(yaml.roleGrants?.[role.name] ?? {})) {
      for (const [objectType, objectIds] of Object.entries(objectLists ?? {})) {
        if (privilege === 'USAGE' && objectType === 'ROLE') {
          continue
        }

        for (const objectId of objectIds) {
          if (objectId === targetObjectId) {
            const finalRole = role.parents[0] ?? role.name

            for (const username of rolesToUsers?.[finalRole]?.users ?? []) {
              res.users.push({
                username,
                privilege,
                roleChain: [...role.parents, role.name],
              })
            }
          }
        }
      }
    }
  }

  return res
}

interface RolesToUsersIndex {
  [roleName: string]: {
    users: string[];
  }
}

function getRolesToUsersIndex(yaml: Yaml): RolesToUsersIndex {
  const res: RolesToUsersIndex = {}

  for (const [username, user] of Object.entries(yaml.userGrants)) {
    for (const roleName of user.roles) {
      if (!res[roleName]) {
        res[roleName] = {
          users: [],
        }
      }

      res[roleName].users.push(username)
    }
  }

  return res
}
