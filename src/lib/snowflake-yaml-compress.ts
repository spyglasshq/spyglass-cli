import {ShowObject, fqDatabaseId, fqObjectId, fqSchemaId} from './snowflake'
import {Yaml} from './yaml'

export async function compressYaml(yaml: Yaml, objects: ShowObject[]): Promise<void> {
  const databasesToSchemas = getDatabasesToSchemas(objects)
  const schemasToObjects = getSchemasToObjects(objects)

  for (const [, roleInfo] of Object.entries(yaml.roleGrants)) {
    if (!roleInfo.usage) {
      continue
    }

    const {database: databases, schema: schemas} = roleInfo.usage

    if (!(databases && schemas)) {
      continue
    }

    const databasesWithAllSchemas = findDatabasesThatHaveAllSchemasGranted(databases, schemas, databasesToSchemas)
    roleInfo.usage.schema = replaceSchemasWithWildcards(databasesWithAllSchemas, schemas)

    for (const permissions of Object.values(roleInfo)) {
      for (const [objType, grantedObjects] of Object.entries(permissions)) {
        const schemasWithAllObjects = findSchemasThatHaveAllObjectsGranted(objType, schemas, grantedObjects, schemasToObjects)
        permissions[objType] = replaceObjectsWithWildcards(objType, grantedObjects, schemasWithAllObjects, databasesWithAllSchemas, databasesToSchemas)
      }
    }
  }
}

interface DatabasesToSchemas {
  [database: string]: Set<string>
}

function getDatabasesToSchemas(objects: ShowObject[]): DatabasesToSchemas {
  const databasesToSchemas: DatabasesToSchemas = {}

  for (const obj of objects) {
    // system schema (not a user object) that isn't granted through select/insert statements
    if (obj.schema_name.toLowerCase() === 'information_schema') {
      continue
    }

    const database = fqDatabaseId(obj.database_name)
    const fqdnSchemas = databasesToSchemas[database] ?? new Set()
    fqdnSchemas.add(fqSchemaId(obj.database_name, obj.schema_name))
    databasesToSchemas[database] = fqdnSchemas
  }

  return databasesToSchemas
}

interface SchemasToObjects {
  [schema: string]: string[]
}

function getSchemasToObjects(objects: ShowObject[]): SchemasToObjects {
  const schemasToObjects: SchemasToObjects = {}

  for (const obj of objects) {
    const schema = fqSchemaId(obj.database_name, obj.schema_name)
    let fqdnObjects = schemasToObjects[schema] ?? []
    const objId = obj.kind.toLowerCase() + ':' + fqObjectId(obj.database_name, obj.schema_name, obj.name)
    fqdnObjects = [objId, ...fqdnObjects]
    schemasToObjects[schema] = fqdnObjects
  }

  return schemasToObjects
}

function findDatabasesThatHaveAllSchemasGranted(databases: string[], schemas: string[], databasesToSchemas: DatabasesToSchemas): string[] {
  let databasesWithAllSchemas: string[] = []

  for (const database of databases) {
    const grantedDatabaseSchemas = new Set(schemas.filter(schema => schema.startsWith(database)))

    if (databasesToSchemas[database]) {
      const hasAllSchemasInDatabase = [...databasesToSchemas[database]].every(s => grantedDatabaseSchemas.has(s))

      if (hasAllSchemasInDatabase) {
        databasesWithAllSchemas = [...databasesWithAllSchemas, database]
      }
    }
  }

  return databasesWithAllSchemas
}

function replaceSchemasWithWildcards(databasesWithAllSchemas: string[], schemas: string[]): string[] {
  let updatedSchemas = schemas
  for (const database of databasesWithAllSchemas) {
    updatedSchemas = updatedSchemas.filter(schema => !schema.startsWith(database + '.') || schema.match('.*<.*>$'))
    updatedSchemas = [...updatedSchemas, `${database}.*`]
  }

  updatedSchemas.sort()

  return updatedSchemas
}

function findSchemasThatHaveAllObjectsGranted(objType: string, schemas: string[], grantedObjects: string[], schemasToObjects: SchemasToObjects): string[] {
  let schemasWithAllObjects: string[] = []

  // find which schemas have all objects granted
  for (const schema of schemas) {
    const grantedSchemaObjects = new Set(grantedObjects.filter(obj => obj.startsWith(schema)).map(oid => objType + ':' + oid))

    if (schemasToObjects[schema]) {
      const hasAllObjectsInSchema = schemasToObjects[schema].every(o => grantedSchemaObjects.has(o))

      if (hasAllObjectsInSchema) {
        schemasWithAllObjects = [...schemasWithAllObjects, schema]
      }
    }
  }

  return schemasWithAllObjects
}

// eslint-disable-next-line max-params
function replaceObjectsWithWildcards(objType: string, grantedObjects: string[], schemasWithAllObjects: string[], databasesWithAllSchemas: string[], databasesToSchemas: DatabasesToSchemas): string[] {
  let updatedObjects = grantedObjects

  // delete objects and replace with a wildcard placeholder (schema level)
  for (const schema of schemasWithAllObjects) {
    updatedObjects = updatedObjects.filter(obj => !obj.startsWith(schema + '.') || obj.match('.*<.*>$'))
    updatedObjects = [...updatedObjects, `${schema}.*`]
  }

  // delete objects and replace with a wildcard placeholder (database level)
  for (const database of databasesWithAllSchemas) {
    if (!databasesToSchemas[database]) {
      continue
    }

    if ([...databasesToSchemas[database]].every(s => schemasWithAllObjects.includes(s))) {
      updatedObjects = updatedObjects.filter(obj => !obj.startsWith(database + '.') || obj.match('.*<.*>$'))
      updatedObjects = [...updatedObjects, `${database}.*`]
    }
  }

  updatedObjects.sort()

  return updatedObjects
}
