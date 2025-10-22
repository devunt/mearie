import type { Source } from '../types.ts';

/**
 * Collects the last value emitted by a source.
 * This is a terminal operator that returns the last emitted value.
 * Rejects if the source completes without emitting any values.
 * @param source - The source to collect from.
 * @returns A promise that resolves with the last emitted value.
 */
export const collect = <T>(source: Source<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    let lastValue: T | undefined;
    let hasValue = false;

    source({
      start(talkback) {
        talkback.pull();
      },
      next(value) {
        lastValue = value;
        hasValue = true;
      },
      complete() {
        if (hasValue) {
          resolve(lastValue!);
        } else {
          reject(new Error('Source completed without emitting any values'));
        }
      },
    });
  });
};
