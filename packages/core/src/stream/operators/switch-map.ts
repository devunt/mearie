import type { Operator, Source, Subscription } from '../types.ts';

export const switchMap = <A, B>(fn: (value: A) => Source<B>): Operator<A, B> => {
  return (source) => {
    return (sink) => {
      let outerCompleted = false;
      let ended = false;
      let innerSubscription: Subscription | null = null;
      let hasInner = false;

      const checkComplete = () => {
        if (outerCompleted && !hasInner && !ended) {
          ended = true;
          sink.complete();
        }
      };

      const outerSubscription = source({
        next(value) {
          if (ended) return;

          if (innerSubscription) {
            innerSubscription.unsubscribe();
            innerSubscription = null;
          }

          hasInner = true;
          const innerSource = fn(value);

          innerSubscription = innerSource({
            next(innerValue) {
              if (!ended) {
                sink.next(innerValue);
              }
            },
            complete() {
              hasInner = false;
              innerSubscription = null;
              checkComplete();
            },
          });
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
          if (innerSubscription) {
            innerSubscription.unsubscribe();
            innerSubscription = null;
          }
        },
      };
    };
  };
};
