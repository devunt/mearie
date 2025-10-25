import type { Operator } from '../types.ts';

/**
 * Executes a side effect when the source terminates (completes or unsubscribes).
 * @param fn - The side effect function.
 * @returns An operator that executes the side effect when the source terminates.
 */
export const finalize = <T>(fn: () => void): Operator<T> => {
  return (source) => {
    return (sink) => {
      let completed = false;

      const subscription = source({
        next(value) {
          if (!completed) {
            sink.next(value);
          }
        },
        complete() {
          if (!completed) {
            completed = true;
            fn();
            sink.complete();
          }
        },
      });

      return {
        unsubscribe() {
          if (!completed) {
            completed = true;
            fn();
          }

          subscription.unsubscribe();
        },
      };
    };
  };
};
