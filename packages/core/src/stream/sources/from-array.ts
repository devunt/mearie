import type { Source } from '../types.ts';

/**
 * Creates a source that emits values from an array and completes.
 * @param values - The array of values to emit.
 * @returns A source containing the array values.
 */
export const fromArray = <T>(values: T[]): Source<T> => {
  return (sink) => {
    let cancelled = false;

    for (const value of values) {
      if (cancelled) break;
      sink.next(value);
    }
    if (!cancelled) {
      sink.complete();
    }

    return {
      unsubscribe() {
        cancelled = true;
      },
    };
  };
};
