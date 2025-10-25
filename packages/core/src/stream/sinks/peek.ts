import type { Source } from '../types.ts';

/**
 * Synchronously reads the first value from a source and immediately unsubscribes.
 * This is useful for reading the current state without maintaining a long-lived subscription.
 * Throws if the source does not emit a value synchronously.
 * @param source - The source to peek from.
 * @returns The first value emitted by the source.
 */
export const peek = <T>(source: Source<T>): T => {
  let value: T | undefined;
  let hasValue = false;

  const subscription = source({
    next(v) {
      if (!hasValue) {
        value = v;
        hasValue = true;
      }
    },
    complete() {},
  });

  subscription.unsubscribe();

  if (hasValue) {
    return value!;
  } else {
    throw new Error('Source did not emit a value synchronously');
  }
};
