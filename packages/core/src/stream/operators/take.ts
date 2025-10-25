import type { Operator, Subscription } from '../types.ts';

/**
 * Takes only the first N values from the source and completes.
 * @param count - The number of values to take.
 * @returns An operator that takes values.
 */
export const take = <T>(count: number): Operator<T> => {
  return (source) => {
    return (sink) => {
      let subscription: Subscription | null = null;

      const limit = Math.floor(count);
      if (limit <= 0) {
        sink.complete();
        return {
          unsubscribe() {},
        };
      }

      let taken = 0;
      let completed = false;

      subscription = source({
        next(value) {
          if (!completed && taken < limit) {
            sink.next(value);
            taken++;
            if (taken >= limit) {
              completed = true;
              sink.complete();
              subscription?.unsubscribe();
            }
          }
        },
        complete() {
          if (!completed) {
            completed = true;
            sink.complete();
          }
        },
      });

      if (completed) {
        subscription?.unsubscribe();
      }

      return {
        unsubscribe() {
          if (!completed) {
            completed = true;
            subscription.unsubscribe();
          }
        },
      };
    };
  };
};
