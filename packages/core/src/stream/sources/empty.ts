import type { Source } from '../types.ts';

/**
 * Creates a source that completes immediately without emitting any values.
 * @returns An empty source.
 */
export const empty = <T = never>(): Source<T> => {
  return (sink) => {
    sink.start({ pull: () => {}, cancel: () => {} });
    sink.complete();
  };
};
