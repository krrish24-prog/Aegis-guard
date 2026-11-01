/**
 * Firestore rejects any write that contains `undefined` ("Unsupported field
 * value: undefined"), which used to abort vault saves and profile updates.
 * Drop undefined values (recursively) while keeping null, 0, false and empty
 * strings, since those are legitimate stored values.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as unknown as T;
  }

  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      result[key] = stripUndefined(entry);
    }
    return result as T;
  }

  return value;
}
