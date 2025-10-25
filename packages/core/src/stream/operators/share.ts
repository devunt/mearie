import type { Operator, Subscription, Sink } from '../types.ts';

/**
 * Shares a single source across multiple subscribers (multicast).
 * The source is only executed once, and all subscribers receive the same values.
 * This is essential for deduplication and caching scenarios.
 * @returns An operator that shares the source.
 */
export const share = <T>(): Operator<T> => {
  return (source) => {
    const sinks: Sink<T>[] = [];
    let subscription: Subscription | null = null;
    let started = false;
    let completed = false;

    return (sink) => {
      if (completed) {
        sink.complete();
        return {
          unsubscribe() {},
        };
      }

      sinks.push(sink);

      if (!started) {
        started = true;

        subscription = source({
          next(value) {
            // eslint-disable-next-line unicorn/no-useless-spread
            for (const s of [...sinks]) {
              if (completed) break;
              s.next(value);
            }
          },
          complete() {
            if (!completed) {
              completed = true;
              // eslint-disable-next-line unicorn/no-useless-spread
              for (const s of [...sinks]) {
                s.complete();
              }
              sinks.length = 0;
            }
          },
        });
      }

      return {
        unsubscribe() {
          const idx = sinks.indexOf(sink);
          if (idx !== -1) {
            sinks.splice(idx, 1);
          }

          if (sinks.length === 0 && subscription) {
            subscription.unsubscribe();
            subscription = null;
            started = false;
          }
        },
      };
    };
  };
};
