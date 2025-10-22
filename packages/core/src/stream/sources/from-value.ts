import type { Source } from '../types.ts';

/**
 * Creates a source that emits a single value and completes.
 * @param value - The value to emit.
 * @returns A source containing the single value.
 */
export const fromValue = <T>(value: T): Source<T> => {
  return (sink) => {
    let cancelled = false;

    sink.start({
      pull() {},
      cancel() {
        cancelled = true;
      },
    });

    if (!cancelled) {
      sink.next(value);
      sink.complete();
    }
  };
};
