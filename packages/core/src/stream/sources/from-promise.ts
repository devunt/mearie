import type { Source } from '../types.ts';

export const fromPromise = <T>(promise: Promise<T>): Source<T> => {
  return (sink) => {
    let cancelled = false;

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

    return {
      unsubscribe() {
        cancelled = true;
      },
    };
  };
};
