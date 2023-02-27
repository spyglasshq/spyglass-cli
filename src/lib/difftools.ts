export function deeplyConvertStringListsToSets(o: any): void {
  for (const k of Object.keys(o)) {
    if (isArrayOfStrings(o[k])) {
      o[k] = stringArrayToRatchetSet(o[k])
      continue
    }

    if (o[k] !== null && typeof o[k] === 'object') {
      deeplyConvertStringListsToSets(o[k])
    }
  }
}

function isArrayOfStrings(arr: any): boolean {
  if (!Array.isArray(arr)) {
    return false
  }

  return arr.every(val => typeof val === 'string')
}

function stringArrayToRatchetSet(arr: string[] | undefined) {
  if (!arr) return {}
  return Object.fromEntries(arr.map(val => [val, '__SET__']))
}

export function deeplyConvertSetsToStringLists(o: any): void {
  for (const k of Object.keys(o)) {
    if (isRatchetSet(o[k])) {
      o[k] = ratchetSetToStringArray(o[k])
      continue
    }

    if (o[k] !== null && typeof o[k] === 'object') {
      deeplyConvertSetsToStringLists(o[k])
    }
  }
}

function isRatchetSet(obj: any): boolean {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  if (Object.values(obj).length === 0) {
    return false
  }

  return Object.values(obj).every(val => val === '__SET__' || val === undefined)
}

function ratchetSetToStringArray(obj: Record<string, unknown> | undefined): string[] {
  if (!obj) return []
  return Object.keys(obj)
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
