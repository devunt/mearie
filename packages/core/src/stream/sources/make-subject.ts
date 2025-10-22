import type { Source, Sink } from '../types.ts';

/**
 * Subject is both a Source and an imperative push API.
 */
export type Subject<T> = {
  /**
   * The source that can be subscribed to.
   */
  source: Source<T>;

  /**
   * Push a value to all subscribers.
   * @param value - The value to push.
   */
  next: (value: T) => void;

  /**
   * Complete all subscribers.
   */
  complete: () => void;
};

/**
 * Creates a new Subject which can be used as an IO event hub.
 * @returns A new Subject.
 */
export const makeSubject = <T>(): Subject<T> => {
  const sinks: Sink<T>[] = [];

  const source: Source<T> = (sink) => {
    sinks.push(sink);

    sink.start({
      pull() {},
      cancel() {
        const idx = sinks.indexOf(sink);
        if (idx !== -1) {
          sinks.splice(idx, 1);
        }
      },
    });
  };

  const next = (value: T) => {
    for (const sink of sinks) {
      sink.next(value);
    }
  };

  const complete = () => {
    for (const sink of sinks) {
      sink.complete();
    }
    sinks.length = 0;
  };

  return {
    source,
    next,
    complete,
  };
};
