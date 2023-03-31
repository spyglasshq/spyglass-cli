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
