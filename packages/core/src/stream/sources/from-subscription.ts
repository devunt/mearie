import type { Source } from '../types.ts';

export const fromSubscription = <T>(pull: () => T, poke: (signal: () => void) => () => void): Source<T> => {
  return (sink) => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    sink.start({
      pull: () => {},
      cancel: () => {
        cancelled = true;
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      },
    });

    if (cancelled) {
      return;
    }

    const initialValue = pull();
    sink.next(initialValue);

    if (cancelled) {
      return;
    }

    unsubscribe = poke(() => {
      if (!cancelled) {
        const value = pull();
        sink.next(value);
      }
    });
  };
};
