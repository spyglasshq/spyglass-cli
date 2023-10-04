function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item))
}

export function mergeDeep(target: Record<string, any>, ...sources: Record<string, any>[]): Record<string, any> {
  if (sources.length === 0) return target
  const source = sources.shift()

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, {[key]: {}})
        mergeDeep(target[key], source[key])
      } else {
        Object.assign(target, {[key]: source[key]})
      }
    }
  }

  return mergeDeep(target, ...sources)
}

export function mergeDeepAndCombineLists(
  target: Record<string, any>,
  ...sources: Record<string, any>[]
): Record<string, any> {
  if (sources.length === 0) return target
  const source = sources.shift()

  if (!source) {
    return target
  }

  if (isObject(target) && isObject(source)) {
    for (const key of Object.keys(source)) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, {[key]: {}})
        mergeDeepAndCombineLists(target[key], source[key])
      } else if (Array.isArray(source[key])) {
        if (!target[key]) target[key] = source[key]
        target[key] = combineLists(target[key], source[key])
      } else {
        Object.assign(target, {[key]: source[key]})
      }
    }
  }

  return mergeDeepAndCombineLists(target, ...sources)
}

function combineLists(a: any[], b: any[]) {
  return [...new Set([...a, ...b])].sort()
}
