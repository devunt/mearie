import type { Operator } from '../types.ts';

/**
 * Executes a side effect for each value without modifying the stream.
 * Useful for debugging, logging, or triggering side effects.
 * @param fn - The side effect function.
 * @returns An operator that taps into the stream.
 */
export const tap = <T>(fn: (value: T) => void): Operator<T> => {
  return (source) => {
    return (sink) => {
      source({
        start(talkback) {
          sink.start(talkback);
        },
        next(value) {
          fn(value);
          sink.next(value);
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
