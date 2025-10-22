import type { Source } from '../types.ts';

export const fromPromise = <T>(promise: Promise<T>): Source<T> => {
  return (sink) => {
    let cancelled = false;

    sink.start({
      pull: () => {},
      cancel: () => {
        cancelled = true;
      },
    });

    if (cancelled) return;

    void promise.then(
      (value) => {
        if (!cancelled) {
          sink.next(value);
          sink.complete();
        }
      },
      () => {
        if (!cancelled) {
          sink.complete();
        }
      },
    );
  };
};
