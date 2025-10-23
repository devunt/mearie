import type { Operator, Sink, Talkback } from '../types.ts';

/**
 * Shares a single source across multiple subscribers (multicast).
 * The source is only executed once, and all subscribers receive the same values.
 * This is essential for deduplication and caching scenarios.
 * @returns An operator that shares the source.
 */
export const share = <T>(): Operator<T> => {
  return (source) => {
    const sinks: Sink<T>[] = [];
    let talkback: Talkback | undefined;
    let started = false;
    let subscriptionPhase = false;
    let completed = false;
    const buffer: T[] = [];

    return (sink) => {
      sinks.push(sink);

      if (completed) {
        sink.start({ pull() {}, cancel() {} });
        sink.complete();
        return;
      }

      if (talkback) {
        sink.start(talkback);
      }

      if (!started) {
        started = true;
        subscriptionPhase = true;

        source({
          start(tb) {
            talkback = tb;
            for (const s of sinks) {
              s.start(tb);
            }
          },
          next(value) {
            if (subscriptionPhase) {
              buffer.push(value);
            } else {
              for (const s of sinks) {
                s.next(value);
              }
            }
          },
          complete() {
            if (subscriptionPhase) {
              setTimeout(() => {
                if (completed) return;
                completed = true;
                for (const value of buffer) {
                  for (const s of sinks) {
                    s.next(value);
                  }
                }
                buffer.length = 0;
                const ss = [...sinks];
                sinks.length = 0;
                for (const s of ss) {
                  s.complete();
                }
              }, 0);
            } else {
              completed = true;
              const ss = [...sinks];
              sinks.length = 0;
              for (const s of ss) {
                s.complete();
              }
            }
          },
        });

        setTimeout(() => {
          subscriptionPhase = false;
          if (completed) return;

          for (const value of buffer) {
            for (const s of sinks) {
              s.next(value);
            }
          }
          buffer.length = 0;
        }, 0);
      }
    };
  };
};
