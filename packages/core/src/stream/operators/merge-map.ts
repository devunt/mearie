import type { Operator, Source, Subscription } from '../types.ts';

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
      const innerSubscriptions: Subscription[] = [];

      const checkComplete = () => {
        if (outerCompleted && activeInner === 0 && !ended) {
          ended = true;
          sink.complete();
        }
      };

      const outerSubscription = source({
        next(value) {
          if (ended) return;

          activeInner++;
          const innerSource = fn(value);

          const innerSubscription = innerSource({
            next(innerValue) {
              if (!ended) {
                sink.next(innerValue);
              }
            },
            complete() {
              activeInner--;
              checkComplete();
            },
          });

          innerSubscriptions.push(innerSubscription);
        },
        complete() {
          outerCompleted = true;
          checkComplete();
        },
      });

      return {
        unsubscribe() {
          ended = true;
          outerSubscription.unsubscribe();
          for (const sub of innerSubscriptions) {
            sub.unsubscribe();
          }
          innerSubscriptions.length = 0;
        },
      };
    };
  };
};
