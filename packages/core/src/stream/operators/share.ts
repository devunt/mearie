import type { Operator, Sink } from '../types.ts';

/**
 * Shares a single source across multiple subscribers (multicast).
 * The source is only executed once, and all subscribers receive the same values.
 * This is essential for deduplication and caching scenarios.
 * @returns An operator that shares the source.
 */
export const share = <T>(): Operator<T> => {
  return (source) => {
    const sinks: Sink<T>[] = [];
    let started = false;

    return (sink) => {
      sinks.push(sink);

      if (!started) {
        started = true;

        setTimeout(() => {
          if (sinks.length === 0) return;

          source({
            start(tb) {
              for (const s of sinks) {
                s.start(tb);
              }
            },
            next(value) {
              for (const s of sinks) {
                s.next(value);
              }
            },
            error(err) {
              const sinksToNotify = [...sinks];
              sinks.length = 0;
              for (const s of sinksToNotify) {
                s.error(err);
              }
            },
            complete() {
              const sinksToNotify = [...sinks];
              sinks.length = 0;
              for (const s of sinksToNotify) {
                s.complete();
              }
            },
          });
        }, 0);
      }
    };
  };
};
