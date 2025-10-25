import type { Operator, Subscription } from '../types.ts';

/**
 * Delays each value emitted by a source by the specified time.
 * @param ms - The time (in milliseconds) to delay each value.
 * @returns An operator that delays values.
 */
export const delay = <T>(ms: number): Operator<T, T> => {
  return (source) => {
    return (sink) => {
      let cancelled = false;
      const timeouts: ReturnType<typeof setTimeout>[] = [];

      const upstreamSubscription: Subscription = source({
        next(value) {
          const timeout = setTimeout(() => {
            if (!cancelled) {
              sink.next(value);
            }
          }, ms);
          timeouts.push(timeout);
        },
        complete() {
          const timeout = setTimeout(() => {
            if (!cancelled) {
              sink.complete();
            }
          }, ms);
          timeouts.push(timeout);
        },
      });

      return {
        unsubscribe() {
          cancelled = true;
          for (const timeout of timeouts) {
            clearTimeout(timeout);
          }
          timeouts.length = 0;
          upstreamSubscription.unsubscribe();
        },
      };
    };
  };
};
