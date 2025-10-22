import type { Source } from '../types.ts';

/**
 * Observer pattern for consuming values from a Source.
 */
export type Observer<T> = {
  /**
   * Called when the source emits a value.
   * @param value - The emitted value.
   */
  next?: (value: T) => void;

  /**
   * Called when the source completes.
   */
  complete?: () => void;
};

/**
 * Subscribe to a Source with an Observer.
 * This is a terminal operator that starts the source execution.
 * @param observer - The observer to receive values.
 * @returns A function that takes a source and returns a subscription.
 */
export const subscribe = <T>(observer: Observer<T>) => {
  return (source: Source<T>): (() => void) => {
    let closed = false;
    let talkback: { pull: () => void; cancel: () => void } | null = null;

    source({
      start(tb) {
        talkback = tb;
        if (!closed) {
          tb.pull();
        }
      },
      next(value) {
        if (!closed && observer.next) {
          observer.next(value);
        }
      },
      complete() {
        if (!closed) {
          closed = true;
          if (observer.complete) {
            observer.complete();
          }
        }
      },
    });

    return () => {
      closed = true;
      if (talkback) {
        talkback.cancel();
      }
    };
  };
};
