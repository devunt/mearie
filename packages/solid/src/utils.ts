/**
 * Copies the nodes `reconcile` is able to rewrite in place — plain objects and arrays, the exact set the
 * solid store wraps reactively and `applyState` walks via `Object.keys`. Everything else (custom scalar
 * values such as `Date`, class instances, primitives) is carried by reference: reconcile replaces those at
 * their parent instead of mutating them, so sharing them is safe and avoids the lossy conversions a
 * `structuredClone` or JSON round-trip would apply.
 */
export const snapshotData = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => snapshotData(item));
  }

  if (typeof value !== 'object' || value === null) return value;

  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const copy = (proto === null ? Object.create(null) : {}) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    copy[key] = snapshotData((value as Record<string, unknown>)[key]);
  }
  return copy;
};
