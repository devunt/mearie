import type { Source } from '../types.ts';

/**
 * Collects all values from a source into an array.
 * This is a terminal operator that accumulates all emitted values.
 * Rejects if the source emits an error.
 * @param source - The source to collect values from.
 * @returns A promise that resolves with an array of all emitted values.
 */
export const collectAll = <T>(source: Source<T>): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    const results: T[] = [];

    source({
      start(talkback) {
        talkback.pull();
      },
      next(value) {
        results.push(value);
      },
      error(err) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(err);
      },
      complete() {
        resolve(results);
      },
    });
  });
};
