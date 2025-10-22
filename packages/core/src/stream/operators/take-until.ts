import type { Source, Operator, Talkback } from '../types.ts';

/**
 * Emits values from the source until the notifier source emits a value.
 * When the notifier emits, the source is cancelled and completes immediately.
 * @param notifier - Source that signals when to complete.
 * @returns Operator that completes when notifier emits.
 */
export const takeUntil = <T>(notifier: Source<unknown>): Operator<T> => {
  return (source) => {
    return (sink) => {
      let sourceTalkback: Talkback | null = null;
      let notifierTalkback: Talkback | null = null;
      let completed = false;

      const complete = () => {
        if (completed) return;
        completed = true;

        if (sourceTalkback) {
          sourceTalkback.cancel();
        }
        if (notifierTalkback) {
          notifierTalkback.cancel();
        }

        sink.complete();
      };

      notifier({
        start(tb) {
          notifierTalkback = tb;
          tb.pull();
        },
        next() {
          complete();
        },
        complete() {
          // do nothing
        },
      });

      source({
        start(tb) {
          sourceTalkback = tb;
          sink.start(tb);
        },
        next(value) {
          if (!completed) {
            sink.next(value);
          }
        },
        complete() {
          complete();
        },
      });
    };
  };
};
