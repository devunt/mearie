import type { Operator } from '../types.ts';

/**
 * Filters values from the source based on a predicate function.
 * @param predicate - The predicate function.
 * @returns An operator that filters values.
 */
export const filter = <T>(predicate: (value: T) => boolean): Operator<T> => {
  return (source) => {
    return (sink) => {
      source({
        start(talkback) {
          sink.start(talkback);
        },
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
};
