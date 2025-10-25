import type { Source } from '../types.ts';

export const publish = <T>(source: Source<T>): void => {
  source({
    next() {},
    complete() {},
  });
};
