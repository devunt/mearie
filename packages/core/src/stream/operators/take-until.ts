import type { Source, Operator, Subscription } from '../types.ts';

/**
 * Emits values from the source until the notifier source emits a value.
 * When the notifier emits, the source is cancelled and completes immediately.
 * @param notifier - Source that signals when to complete.
 * @returns Operator that completes when notifier emits.
 */
export const takeUntil = <T>(notifier: Source<unknown>): Operator<T> => {
  return (source) => {
    return (sink) => {
      let sourceSubscription: Subscription | null = null;
      let notifierSubscription: Subscription | null = null;
      let completed = false;

      const complete = () => {
        if (completed) return;
        completed = true;

        if (sourceSubscription) {
          sourceSubscription.unsubscribe();
        }

        if (notifierSubscription) {
          notifierSubscription.unsubscribe();
        }

        sink.complete();
      };

      notifierSubscription = notifier({
        next() {
          complete();
        },
        complete() {},
      });

      sourceSubscription = source({
        next(value) {
          if (!completed) {
            sink.next(value);
          }
        },
        complete() {
          complete();
        },
      });

      return {
        unsubscribe() {
          complete();
        },
      };
    };
  };
};
