/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export function deeplyConvertStringListsToSets(o: any): void {
  for (const k of Object.keys(o)) {
    if (isArrayOfStrings(o[k])) {
      o[k] = stringArrayToObjectBackedSet(o[k])
      continue
    }

    if (o[k] !== null && typeof o[k] === 'object') {
      deeplyConvertStringListsToSets(o[k])
    }
  }
}

export function isArrayOfStrings(arr: any): boolean {
  if (!Array.isArray(arr)) {
    return false
  }

  if (arr.length === 0) {
    return false
  }

  return arr.every(val => typeof val === 'string')
}

// Since our deep-diff library can't compare the "set" type, and it
// doesn't do uniqueness diffing on lists, we convert the array into
// an object where the values are '__SPYGLASS_SET__'.
//
// We use this special sentinel value so that we can easily find these
// objects when we need to convert them back to simple lists later.
export function stringArrayToObjectBackedSet(arr: string[] | undefined): Record<string, string> | undefined {
  if (!arr) return arr
  return Object.fromEntries(arr.map(val => [val, '__SPYGLASS_SET__']))
}

export function objectBackedSetToStringArray(obj: Record<string, unknown> | undefined): string[] | any {
  if (!obj) return obj
  return Object.keys(obj).sort()
}

export function deeplyConvertSetsToStringLists(o: any): void {
  for (const k of Object.keys(o)) {
    if (isObjectBackedSet(o[k])) {
      o[k] = objectBackedSetToStringArray(o[k])
      continue
    }

    if (o[k] !== null && typeof o[k] === 'object') {
      deeplyConvertSetsToStringLists(o[k])
    }
  }
}

function isObjectBackedSet(obj: any): boolean {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  if (Object.values(obj).length === 0) {
    return false
  }

  return Object.values(obj).every(val => val === '__SPYGLASS_SET__' || val === undefined)
}

export function replaceUndefinedValuesWithDeletedValues(o: any, current: any, keys: string[] = []): void {
  for (const k of Object.keys(o)) {
    keys.push(k)

    if (o[k] === undefined) {
      o[k] = getValue(current, keys)
      keys.pop()
      continue
    }

    if (o[k] !== null && typeof o[k] === 'object') {
      replaceUndefinedValuesWithDeletedValues(o[k], current, keys)
    }

    keys.pop()
  }
}

function getValue(obj: any, keys: string[]): any | undefined {
  let val = obj
  for (const key of keys) {
    val = val[key]
  }

  return val
}

export function deeplySortLists(o: any): void {
  for (const k of Object.keys(o)) {
    if (isArrayOfStrings(o[k])) {
      o[k].sort()
      continue
    }

    if (o[k] !== null && typeof o[k] === 'object') {
      deeplySortLists(o[k])
    }
  }
}
