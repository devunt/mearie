import { describe, it, expect } from 'vitest';
import { take } from './take.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from './map.ts';
import type { Sink, Subscription } from '../types.ts';

describe('take', () => {
  describe('basic functionality', () => {
    it('should take first N values', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(source, take(3), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should take single value', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, take(1), collectAll);

      expect(result).toEqual([1]);
    });

    it('should take all values when count equals source length', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, take(3), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should take all values when count exceeds source length', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, take(10), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle taking from single value source', async () => {
      const source = fromValue(42);

      const result = await pipe(source, take(1), collectAll);

      expect(result).toEqual([42]);
    });

    it('should handle taking more than single value source has', async () => {
      const source = fromValue(42);

      const result = await pipe(source, take(5), collectAll);

      expect(result).toEqual([42]);
    });
  });

  describe('edge cases', () => {
    it('should complete immediately when count is 0', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, take(0), collectAll);

      expect(result).toEqual([]);
    });

    it('should complete immediately when count is negative', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, take(-5), collectAll);

      expect(result).toEqual([]);
    });

    it('should handle decimal count by flooring', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(source, take(2.7), collectAll);

      expect(result).toEqual([1, 2]);
    });

    it('should handle empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(source, take(3), collectAll);

      expect(result).toEqual([]);
    });

    it('should handle taking 0 from empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(source, take(0), collectAll);

      expect(result).toEqual([]);
    });
  });

  describe('cancellation', () => {
    it('should cancel source after taking N values', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      let cancelled = false;

      const customSource = (sink: Sink<number>) => {
        const subscription = source({
          next: (value) => sink.next(value),
          complete: () => sink.complete(),
        });

        return {
          unsubscribe: () => {
            cancelled = true;
            subscription.unsubscribe();
          },
        };
      };

      await pipe(customSource, take(2), collectAll);

      expect(cancelled).toBe(true);
    });

    it('should not emit values after reaching limit', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const emitted: number[] = [];

      await pipe(
        source,
        take(3),
        map((x) => {
          emitted.push(x);
          return x;
        }),
        collectAll,
      );

      expect(emitted).toEqual([1, 2, 3]);
    });
  });

  describe('chaining', () => {
    it('should work with map operator', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        take(3),
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([2, 4, 6]);
    });

    it('should work before map operator', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        take(3),
        collectAll,
      );

      expect(result).toEqual([2, 4, 6]);
    });

    it('should work with multiple take operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const result = await pipe(source, take(7), take(5), take(3), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should take minimum when chained', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(source, take(4), take(2), collectAll);

      expect(result).toEqual([1, 2]);
    });
  });

  describe('completion', () => {
    it('should complete after taking N values', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      let completed = false;

      pipe(
        source,
        take(3),
      )({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should complete when source completes before reaching limit', () => {
      const source = fromArray([1, 2, 3]);
      let completed = false;

      pipe(
        source,
        take(10),
      )({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should complete immediately when count is 0', () => {
      const source = fromArray([1, 2, 3]);
      let completed = false;

      pipe(
        source,
        take(0),
      )({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });
  });

  describe('subscription', () => {
    it('should provide subscription', () => {
      const source = fromArray([1, 2, 3]);
      const subscription: Subscription;

      subscription = pipe(
        source,
        take(2),
      )({
        next: () => {},
        complete: () => {},
      });

      expect(subscription).not.toBeNull();
      expect(subscription).toHaveProperty('unsubscribe');
    });
  });

  describe('falsy values', () => {
    it('should handle null values', async () => {
      const source = fromArray<number | null>([null, 1, null, 2, null]);

      const result = await pipe(source, take(3), collectAll);

      expect(result).toEqual([null, 1, null]);
    });

    it('should handle undefined values', async () => {
      const source = fromArray<number | undefined>([undefined, 1, undefined]);

      const result = await pipe(source, take(2), collectAll);

      expect(result).toEqual([undefined, 1]);
    });

    it('should handle zero', async () => {
      const source = fromArray([0, 1, 2, 3]);

      const result = await pipe(source, take(2), collectAll);

      expect(result).toEqual([0, 1]);
    });

    it('should handle false', async () => {
      const source = fromArray([false, true, false]);

      const result = await pipe(source, take(2), collectAll);

      expect(result).toEqual([false, true]);
    });

    it('should handle empty string', async () => {
      const source = fromArray(['', 'a', '', 'b']);

      const result = await pipe(source, take(3), collectAll);

      expect(result).toEqual(['', 'a', '']);
    });
  });

  describe('complex values', () => {
    it('should handle object values', async () => {
      const source = fromArray([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ]);

      const result = await pipe(source, take(2), collectAll);

      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should handle array values', async () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);

      const result = await pipe(source, take(2), collectAll);

      expect(result).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('performance', () => {
    it('should not process values after limit', async () => {
      const source = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const processedValues: number[] = [];

      await pipe(
        source,
        take(3),
        map((x) => {
          processedValues.push(x);
          return x;
        }),
        collectAll,
      );

      expect(processedValues).toEqual([1, 2, 3]);
    });

    it('should cancel immediately after reaching limit', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const nextCalls: number[] = [];

      pipe(
        source,
        take(2),
      )({
        next: (value) => {
          nextCalls.push(value);
        },
        complete: () => {},
      });

      expect(nextCalls).toEqual([1, 2]);
    });
  });

  describe('large numbers', () => {
    it('should handle large count values', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, take(1_000_000), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle taking from large source', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i + 1);
      const source = fromArray(largeArray);

      const result = await pipe(source, take(5), collectAll);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
