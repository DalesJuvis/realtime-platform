/** Returns a shallow copy of `record` without `key`. */
export function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const result: Record<string, T> = {}
  for (const [k, v] of Object.entries(record)) {
    if (k !== key) result[k] = v
  }
  return result
}
