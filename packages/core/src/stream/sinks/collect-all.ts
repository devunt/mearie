import type { Source } from '../types.ts';

/**
 * Collects all values from a source into an array.
 * This is a terminal operator that accumulates all emitted values.
 * @param source - The source to collect values from.
 * @returns A promise that resolves with an array of all emitted values.
 */
export const collectAll = <T>(source: Source<T>): Promise<T[]> => {
  return new Promise((resolve) => {
    const results: T[] = [];

    source({
      next(value) {
        results.push(value);
      },
      complete() {
        resolve(results);
      },
    });
  });
};
