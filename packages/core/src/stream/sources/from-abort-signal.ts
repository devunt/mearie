import { make } from './make.ts';
import type { Source } from '../types.ts';

/**
 * Creates a source that emits when the given AbortSignal is aborted.
 * If the signal is already aborted, emits immediately.
 * @param signal - The AbortSignal to observe.
 * @returns A Source that emits once when the signal aborts.
 */
export const fromAbortSignal = (signal: AbortSignal): Source<void> => {
  return make<void>(({ next, complete }) => {
    if (signal.aborted) {
      next(void 0);
      complete();
      return () => {};
    }
    const handler = () => {
      next(void 0);
      complete();
    };
    signal.addEventListener('abort', handler);
    return () => signal.removeEventListener('abort', handler);
  });
};
