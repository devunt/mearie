import { describe, it, expect } from 'vitest';
import { takeUntil } from './take-until.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { makeSubject } from '../sources/make-subject.ts';
import type { Sink } from '../types.ts';

describe('takeUntil', () => {
  describe('basic functionality', () => {
    it('should take values until notifier emits', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const { source: notifier, next } = makeSubject<void>();

      const resultPromise = pipe(source, takeUntil(notifier), collectAll);

      setTimeout(() => next(), 0);

      const result = await resultPromise;

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should complete immediately when notifier emits before source', async () => {
      const source = fromArray([1, 2, 3]);
      // eslint-disable-next-line unicorn/no-useless-undefined
      const notifier = fromValue(undefined);

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([]);
    });

    it('should take all values when notifier never emits', async () => {
      const source = fromArray([1, 2, 3]);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should complete when source completes before notifier', async () => {
      const source = fromArray([1, 2, 3]);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('timing', () => {
    it('should emit values received before notifier', () => {
      const emitted: number[] = [];
      const source = fromArray([1, 2, 3, 4, 5]);
      const { source: notifier, next } = makeSubject<void>();

      pipe(
        source,
        takeUntil(notifier),
      )({
        start: (tb) => {
          tb.pull();
        },
        next: (value) => {
          emitted.push(value);
          if (value === 3) {
            next();
          }
        },
        complete: () => {},
      });

      expect(emitted.length).toBeGreaterThanOrEqual(3);
      expect(emitted.slice(0, 3)).toEqual([1, 2, 3]);
    });

    it('should not emit values after notifier emits', () => {
      const emitted: number[] = [];
      const source = fromArray([1, 2, 3, 4, 5]);
      // eslint-disable-next-line unicorn/no-useless-undefined
      const notifier = fromValue(undefined);

      pipe(
        source,
        takeUntil(notifier),
      )({
        start: (tb) => {
          tb.pull();
        },
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([]);
    });
  });

  describe('cancellation', () => {
    it('should cancel source when notifier emits', () => {
      let sourceCancelled = false;
      const { source: notifier, next } = makeSubject<void>();

      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {
            sourceCancelled = true;
          },
        });
      };

      pipe(
        source,
        takeUntil(notifier),
      )({
        start: () => {},
        next: () => {},
        complete: () => {},
      });

      next();

      expect(sourceCancelled).toBe(true);
    });

    it('should cancel notifier when source completes', async () => {
      let notifierCancelled = false;

      const source = fromArray([1, 2, 3]);

      const notifier = (sink: Sink<void>) => {
        sink.start({
          pull: () => {},
          cancel: () => {
            notifierCancelled = true;
          },
        });
      };

      await pipe(source, takeUntil(notifier), collectAll);

      expect(notifierCancelled).toBe(true);
    });
  });

  describe('completion', () => {
    it('should complete when notifier emits', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      // eslint-disable-next-line unicorn/no-useless-undefined
      const notifier = fromValue(undefined);

      let completed = false;

      pipe(
        source,
        takeUntil(notifier),
      )({
        start: (tb) => {
          tb.pull();
        },
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should complete when source completes', () => {
      const source = fromArray([1, 2, 3]);
      const { source: notifier } = makeSubject<void>();

      let completed = false;

      pipe(
        source,
        takeUntil(notifier),
      )({
        start: (tb) => {
          tb.pull();
        },
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty source', async () => {
      const source = fromArray<number>([]);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([]);
    });

    it('should handle source with single value', async () => {
      const source = fromValue(42);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([42]);
    });

    it('should handle notifier emitting multiple times', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const { source: notifier, next } = makeSubject<void>();

      const resultPromise = pipe(source, takeUntil(notifier), collectAll);

      setTimeout(() => {
        next();
        next();
        next();
      }, 0);

      const result = await resultPromise;

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('chaining', () => {
    it('should work with other operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const { source: notifier, next } = makeSubject<void>();

      const resultPromise = pipe(source, takeUntil(notifier), collectAll);

      setTimeout(() => next(), 0);

      const result = await resultPromise;

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('falsy values', () => {
    it('should handle null values', async () => {
      const source = fromArray<number | null>([null, 1, null, 2]);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([null, 1, null, 2]);
    });

    it('should handle undefined values', async () => {
      const source = fromArray<number | undefined>([undefined, 1, undefined]);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([undefined, 1, undefined]);
    });

    it('should handle zero', async () => {
      const source = fromArray([0, 1, 2]);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([0, 1, 2]);
    });

    it('should handle false', async () => {
      const source = fromArray([false, true, false]);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([false, true, false]);
    });

    it('should handle empty string', async () => {
      const source = fromArray(['', 'a', '']);
      const { source: notifier } = makeSubject<void>();

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual(['', 'a', '']);
    });
  });

  describe('notifier value types', () => {
    it('should complete regardless of notifier value type', async () => {
      const source = fromArray([1, 2, 3]);
      const notifier = fromValue('any value');

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([]);
    });

    it('should work with number notifier', async () => {
      const source = fromArray([1, 2, 3]);
      const notifier = fromValue(123);

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([]);
    });

    it('should work with object notifier', async () => {
      const source = fromArray([1, 2, 3]);
      const notifier = fromValue({ stop: true });

      const result = await pipe(source, takeUntil(notifier), collectAll);

      expect(result).toEqual([]);
    });
  });
});
