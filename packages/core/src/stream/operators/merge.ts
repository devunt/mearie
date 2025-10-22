import type { Source, Talkback } from '../types.ts';

/**
 * Merges multiple sources into a single source.
 * Values are emitted as soon as they arrive from any source.
 * Completes when all sources complete.
 * @param sources - The sources to merge.
 * @returns A merged source.
 */
export const merge = <T>(...sources: Source<T>[]): Source<T> => {
  return (sink) => {
    if (sources.length === 0) {
      sink.start({ pull() {}, cancel() {} });
      sink.complete();
      return;
    }

    let activeCount = sources.length;
    const talkbacks: Talkback[] = [];
    let ended = false;

    const checkComplete = () => {
      if (activeCount === 0 && !ended) {
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
            sink.next(value);
          }
        },
        complete() {
          activeCount--;
          checkComplete();
        },
      });
    }
  };
};
