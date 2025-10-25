import type { Operator } from '../types.ts';

/**
 *
 * @param predicate - The predicate function.
 * @returns An operator that filters values.
 */
export function filter<T, S extends T>(predicate: (value: T) => value is S): Operator<T, S>;
export function filter<T>(predicate: (value: T) => boolean): Operator<T>;
export function filter<T>(predicate: (value: T) => boolean): Operator<T> {
  return (source) => {
    return (sink) => {
      return source({
        next(value) {
          if (predicate(value)) {
            sink.next(value);
          }
        },
        complete() {
          sink.complete();
        },
      });
    };
  };
}
