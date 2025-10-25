import type { Source, Subscription } from '../types.ts';

/**
 * Merges multiple sources into a single source.
 * Values are emitted as soon as they arrive from any source.
 * Completes when all sources complete.
 * @param sources - The sources to merge.
 * @returns A merged source.
 */
export const merge = <T extends readonly Source<unknown>[]>(
  ...sources: T
): Source<T[number] extends Source<infer U> ? U : never> => {
  type U = T[number] extends Source<infer U> ? U : never;

  return (sink) => {
    if (sources.length === 0) {
      sink.complete();
      return {
        unsubscribe() {},
      };
    }

    let activeCount = sources.length;
    const subscriptions: Subscription[] = [];
    let ended = false;
    let ready = false;
    const buffer: U[] = [];

    const checkComplete = () => {
      if (activeCount === 0 && !ended) {
        ended = true;
        sink.complete();
      }
    };

    for (const source of sources) {
      const subscription = source({
        next(value) {
          if (!ended) {
            if (ready) {
              sink.next(value as U);
            } else {
              buffer.push(value as U);
            }
          }
        },
        complete() {
          activeCount--;
          if (ready) {
            checkComplete();
          }
        },
      });
      subscriptions.push(subscription);
    }

    ready = true;

    for (const value of buffer) {
      if (!ended) {
        sink.next(value);
      }
    }
    buffer.length = 0;

    checkComplete();

    return {
      unsubscribe() {
        ended = true;
        for (const sub of subscriptions) {
          sub.unsubscribe();
        }
      },
    };
  };
};
