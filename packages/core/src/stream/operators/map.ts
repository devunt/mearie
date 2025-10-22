import type { Operator } from '../types.ts';

/**
 * Maps each value from the source through a transformation function.
 * @param fn - The transformation function.
 * @returns An operator that maps values.
 */
export const map = <A, B>(fn: (value: A) => B): Operator<A, B> => {
  return (source) => {
    return (sink) => {
      source({
        start(talkback) {
          sink.start(talkback);
        },
        next(value) {
          sink.next(fn(value));
        },
        error(err) {
          sink.error(err);
        },
        complete() {
          sink.complete();
        },
      });
    };
  };
};
