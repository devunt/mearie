import type { Source, Talkback } from '../types.ts';

/**
 * Synchronously pulls the first value from a source and immediately cancels the subscription.
 * This is useful for reading the current state without maintaining a long-lived subscription.
 * Throws if the source does not emit a value synchronously.
 * @param source - The source to peek from.
 * @returns The first value emitted by the source.
 */
export const peek = <T>(source: Source<T>): T => {
  let value: T | undefined;
  let hasValue = false;
  let talkback: Talkback | null = null;

  source({
    start(tb) {
      talkback = tb;
      tb.pull();
    },
    next(v) {
      value = v;
      hasValue = true;
      talkback?.cancel();
    },
    complete() {},
  });

  if (!hasValue) {
    throw new Error('Source did not emit a value synchronously');
  }

  return value!;
};
