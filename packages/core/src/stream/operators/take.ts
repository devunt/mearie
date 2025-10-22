import type { Operator, Talkback } from '../types.ts';

/**
 * Takes only the first N values from the source and completes.
 * @param count - The number of values to take.
 * @returns An operator that takes values.
 */
export const take = <T>(count: number): Operator<T> => {
  return (source) => {
    return (sink) => {
      const limit = Math.floor(count);
      if (limit <= 0) {
        sink.start({ pull() {}, cancel() {} });
        sink.complete();
        return;
      }

      let taken = 0;
      let talkback: Talkback;

      source({
        start(tb) {
          talkback = tb;
          sink.start(tb);
        },
        next(value) {
          if (taken < limit) {
            sink.next(value);
            taken++;
            if (taken >= limit) {
              talkback.cancel();
              sink.complete();
            }
          }
        },
        error(err) {
          sink.error(err);
        },
        complete() {
          sink.complete();
        },
      });
    };
  };
};
