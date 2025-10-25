import type { Operator } from '../types.ts';

/**
 * Executes a side effect when the source is initialized (being subscribed to).
 * @param fn - The side effect function.
 * @returns An operator that executes the side effect when the source is initialized.
 */
export const initialize = <T>(fn: () => void): Operator<T> => {
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
            sink.complete();
          }
        },
      });

      fn();

      return {
        unsubscribe() {
          completed = true;
          subscription.unsubscribe();
        },
      };
    };
  };
};
