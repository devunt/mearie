import type { Operator, Source } from '../types.ts';

/**
 * Maps each value to a source and flattens all sources into a single output source.
 * Similar to flatMap. Values from all inner sources are merged concurrently.
 * @param fn - Function that returns a source for each value.
 * @returns An operator that flattens mapped sources.
 */
export const mergeMap = <A, B>(fn: (value: A) => Source<B>): Operator<A, B> => {
  return (source) => {
    return (sink) => {
      let outerCompleted = false;
      let activeInner = 0;
      let ended = false;

      const checkComplete = () => {
        if (outerCompleted && activeInner === 0 && !ended) {
          ended = true;
          sink.complete();
        }
      };

      source({
        start(talkback) {
          sink.start(talkback);
        },
        next(value) {
          if (ended) return;

          activeInner++;
          const innerSource = fn(value);

          innerSource({
            start(talkback) {
              talkback.pull();
            },
            next(innerValue) {
              if (!ended) {
                sink.next(innerValue);
              }
            },
            error(err) {
              if (!ended) {
                ended = true;
                sink.error(err);
              }
            },
            complete() {
              activeInner--;
              checkComplete();
            },
          });
        },
        error(err) {
          if (!ended) {
            ended = true;
            sink.error(err);
          }
        },
        complete() {
          outerCompleted = true;
          checkComplete();
        },
      });
    };
  };
};
