import type { Source } from '../types.ts';

/**
 * Creates a source that never emits any values.
 * @returns A never source.
 */
export const never = <T = never>(): Source<T> => {
  return () => {
    return {
      unsubscribe() {},
    };
  };
};
