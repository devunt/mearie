import type { Source } from '../types.ts';

/**
 * Creates a new Source from scratch from a passed subscriber function.
 *
 * The subscriber function receives an observer with next and complete callbacks.
 * It must return a teardown function which is called when the source is cancelled.
 * @internal
 * @param subscriber - A callback that is called when the Source is subscribed to.
 * @returns A Source created from the subscriber parameter.
 */
export const make = <T>(
  subscriber: (observer: { next: (value: T) => void; complete: () => void }) => () => void,
): Source<T> => {
  return (sink) => {
    let cancelled = false;
    let teardown: (() => void) | null = null;

    teardown = subscriber({
      next: (value) => {
        if (!cancelled) {
          sink.next(value);
        }
      },
      complete: () => {
        if (!cancelled) {
          cancelled = true;
          if (teardown) {
            teardown();
            teardown = null;
          }
          sink.complete();
        }
      },
    });

    return {
      unsubscribe() {
        cancelled = true;
        if (teardown) {
          teardown();
          teardown = null;
        }
      },
    };
  };
};
