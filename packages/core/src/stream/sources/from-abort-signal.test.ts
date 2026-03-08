import { describe, it, expect, vi } from 'vitest';
import { fromAbortSignal } from './from-abort-signal.ts';
import { pipe } from '../pipe.ts';
import { subscribe } from '../sinks/subscribe.ts';
import { takeUntil } from '../operators/take-until.ts';
import { makeSubject } from './make-subject.ts';

describe('fromAbortSignal', () => {
  describe('basic functionality', () => {
    it('should emit and complete when signal is aborted', () => {
      const controller = new AbortController();
      const source = fromAbortSignal(controller.signal);

      const next = vi.fn();
      let completed = false;

      pipe(
        source,
        subscribe({
          next,
          complete() {
            completed = true;
          },
        }),
      );

      expect(next).not.toHaveBeenCalled();
      expect(completed).toBe(false);

      controller.abort();

      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith(undefined);
      expect(completed).toBe(true);
    });

    it('should emit and complete immediately when signal is already aborted', () => {
      const controller = new AbortController();
      controller.abort();

      const source = fromAbortSignal(controller.signal);

      const next = vi.fn();
      let completed = false;

      pipe(
        source,
        subscribe({
          next,
          complete() {
            completed = true;
          },
        }),
      );

      expect(next).toHaveBeenCalledOnce();
      expect(completed).toBe(true);
    });

    it('should not emit if not aborted', () => {
      const controller = new AbortController();
      const source = fromAbortSignal(controller.signal);

      const next = vi.fn();

      pipe(source, subscribe({ next, complete() {} }));

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove event listener on unsubscribe', () => {
      const controller = new AbortController();
      const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

      const source = fromAbortSignal(controller.signal);

      const subscription = source({ next() {}, complete() {} });

      subscription.unsubscribe();

      expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    });

    it('should not emit after unsubscribe', () => {
      const controller = new AbortController();
      const source = fromAbortSignal(controller.signal);

      const next = vi.fn();

      const subscription = source({ next, complete() {} });

      subscription.unsubscribe();
      controller.abort();

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('composition with takeUntil', () => {
    it('should complete a source when signal aborts', () => {
      const controller = new AbortController();
      const subject = makeSubject<number>();

      const values: number[] = [];
      let completed = false;

      pipe(
        subject.source,
        takeUntil(fromAbortSignal(controller.signal)),
        subscribe({
          next(value) {
            values.push(value);
          },
          complete() {
            completed = true;
          },
        }),
      );

      subject.next(1);
      subject.next(2);

      expect(values).toEqual([1, 2]);
      expect(completed).toBe(false);

      controller.abort();

      expect(completed).toBe(true);

      subject.next(3);

      expect(values).toEqual([1, 2]);
    });
  });
});
