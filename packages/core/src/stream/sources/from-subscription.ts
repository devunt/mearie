import type { Source } from '../types.ts';

export const fromSubscription = <T>(pull: () => T, poke: (signal: () => void) => () => void): Source<T> => {
  return (sink) => {
    let teardown: (() => void) | null = null;
    let cancelled = false;

    const initialValue = pull();
    sink.next(initialValue);

    if (cancelled) {
      return {
        unsubscribe() {
          cancelled = true;
        },
      };
    }

    teardown = poke(() => {
      if (!cancelled) {
        const value = pull();
        sink.next(value);
      }
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
