import type { Source, Talkback } from '../types.ts';

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
      sink.start({ pull() {}, cancel() {} });
      sink.complete();
      return;
    }

    let activeCount = sources.length;
    const talkbacks: Talkback[] = [];
    const pendings: U[] = [];

    let subscribed = false;
    let ended = false;

    const checkComplete = () => {
      if (activeCount === 0 && subscribed && !ended) {
        ended = true;
        sink.complete();
      }
    };

    sink.start({
      pull() {
        for (const tb of talkbacks) {
          tb.pull();
        }
      },
      cancel() {
        ended = true;
        for (const tb of talkbacks) {
          tb.cancel();
        }
      },
    });

    for (const source of sources) {
      source({
        start(talkback) {
          talkbacks.push(talkback);
        },
        next(value) {
          if (!ended) {
            if (subscribed) {
              sink.next(value as U);
            } else {
              pendings.push(value as U);
            }
          }
        },
        complete() {
          activeCount--;
          checkComplete();
        },
      });
    }

    subscribed = true;
    for (const value of pendings) {
      if (!ended) {
        sink.next(value);
      }
    }
    pendings.length = 0;

    checkComplete();
  };
};
