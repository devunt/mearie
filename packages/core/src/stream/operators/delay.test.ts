import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { delay } from './delay.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { pipe } from '../pipe.ts';
import type { Subscription } from '../types.ts';

describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should delay each value by specified time', () => {
      const source = fromArray([1, 2, 3]);
      const emitted: number[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([]);

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([1, 2, 3]);
    });

    it('should delay single value', () => {
      const source = fromValue(42);
      const emitted: number[] = [];

      pipe(
        source,
        delay(50),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([]);

      vi.advanceTimersByTime(50);
      expect(emitted).toEqual([42]);
    });

    it('should delay completion signal', () => {
      const source = fromArray([1, 2, 3]);
      let completed = false;

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(false);

      vi.advanceTimersByTime(100);
      expect(completed).toBe(true);
    });

    it('should handle empty source', () => {
      const source = fromArray<number>([]);
      let completed = false;

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(false);

      vi.advanceTimersByTime(100);
      expect(completed).toBe(true);
    });
  });

  describe('delay timing', () => {
    it('should delay by exact specified milliseconds', () => {
      const source = fromArray([1]);
      const emitted: number[] = [];

      pipe(
        source,
        delay(250),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(249);
      expect(emitted).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(emitted).toEqual([1]);
    });

    it('should handle zero delay', () => {
      const source = fromArray([1, 2, 3]);
      const emitted: number[] = [];

      pipe(
        source,
        delay(0),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([]);

      vi.advanceTimersByTime(0);
      expect(emitted).toEqual([1, 2, 3]);
    });

    it('should delay each value independently', () => {
      const source = fromArray([1, 2, 3]);
      const emitted: number[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([1, 2, 3]);
    });
  });

  describe('cancellation', () => {
    it('should clear pending timeouts on cancel', () => {
      const source = fromArray([1, 2, 3]);
      const emitted: number[] = [];
      let subscription: Subscription;

      subscription = pipe(
        source,
        delay(100),
      )({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      subscription.unsubscribe();

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([]);
    });

    it('should not emit values after cancellation', () => {
      const source = fromArray([1, 2, 3]);
      const emitted: number[] = [];
      let subscription: Subscription;

      subscription = pipe(
        source,
        delay(100),
      )({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(50);
      subscription.unsubscribe();
      vi.advanceTimersByTime(50);

      expect(emitted).toEqual([]);
    });

    it('should not emit completion after cancellation', () => {
      const source = fromArray([1, 2, 3]);
      let completed = false;
      let subscription: Subscription;

      subscription = pipe(
        source,
        delay(100),
      )({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      subscription.unsubscribe();
      vi.advanceTimersByTime(100);

      expect(completed).toBe(false);
    });

    it('should cancel upstream source', () => {
      const source = fromArray([1, 2, 3]);
      let subscription: Subscription;

      subscription = pipe(
        source,
        delay(100),
      )({
        next: () => {},
        complete: () => {},
      });

      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('multiple values', () => {
    it('should delay multiple values', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const emitted: number[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([1, 2, 3, 4, 5]);
    });

    it('should preserve value order', () => {
      const source = fromArray([5, 4, 3, 2, 1]);
      const emitted: number[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([5, 4, 3, 2, 1]);
    });
  });

  describe('value types', () => {
    it('should delay strings', () => {
      const source = fromArray(['a', 'b', 'c']);
      const emitted: string[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual(['a', 'b', 'c']);
    });

    it('should delay objects', () => {
      const source = fromArray([{ id: 1 }, { id: 2 }]);
      const emitted: { id: number }[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should delay arrays', () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);
      const emitted: number[][] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('falsy values', () => {
    it('should delay null values', () => {
      const source = fromArray<number | null>([1, null, 3]);
      const emitted: (number | null)[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([1, null, 3]);
    });

    it('should delay undefined values', () => {
      const source = fromArray<number | undefined>([1, undefined, 3]);
      const emitted: (number | undefined)[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([1, undefined, 3]);
    });

    it('should delay zero', () => {
      const source = fromArray([0, 1, 0]);
      const emitted: number[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([0, 1, 0]);
    });

    it('should delay false', () => {
      const source = fromArray([true, false, true]);
      const emitted: boolean[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([true, false, true]);
    });

    it('should delay empty string', () => {
      const source = fromArray(['a', '', 'c']);
      const emitted: string[] = [];

      pipe(
        source,
        delay(100),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual(['a', '', 'c']);
    });
  });

  describe('subscription', () => {
    it('should provide subscription', () => {
      const source = fromArray([1, 2, 3]);
      let subscription: Subscription;

      subscription = pipe(
        source,
        delay(100),
      )({
        next: () => {},
        complete: () => {},
      });

      expect(subscription).not.toBeNull();
      expect(subscription).toHaveProperty('unsubscribe');
    });
  });

  describe('edge cases', () => {
    it('should handle cancellation before first value', () => {
      const source = fromArray([1, 2, 3]);
      const emitted: number[] = [];
      let subscription: Subscription;

      subscription = pipe(
        source,
        delay(100),
      )({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      subscription.unsubscribe();

      vi.advanceTimersByTime(100);
      expect(emitted).toEqual([]);
    });

    it('should handle very long delays', () => {
      const source = fromValue(1);
      const emitted: number[] = [];

      pipe(
        source,
        delay(10000),
      )({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      vi.advanceTimersByTime(9999);
      expect(emitted).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(emitted).toEqual([1]);
    });
  });
});
