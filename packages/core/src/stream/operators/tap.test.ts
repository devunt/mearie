import { describe, it, expect } from 'vitest';
import { tap } from './tap.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from './map.ts';
import { filter } from './filter.ts';
import type { Sink } from '../types.ts';

describe('tap', () => {
  describe('basic behavior', () => {
    it('should execute side effect for each value', async () => {
      const source = fromArray([1, 2, 3]);
      const sideEffects: number[] = [];

      await pipe(
        source,
        tap((x) => {
          sideEffects.push(x);
        }),
        collectAll,
      );

      expect(sideEffects).toEqual([1, 2, 3]);
    });

    it('should pass through values unchanged', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        tap(() => {}),
        collectAll,
      );

      expect(result).toEqual([1, 2, 3]);
    });

    it('should not modify stream values', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        tap((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle single value', async () => {
      const source = fromValue(42);
      const sideEffects: number[] = [];

      await pipe(
        source,
        tap((x) => {
          sideEffects.push(x);
        }),
        collectAll,
      );

      expect(sideEffects).toEqual([42]);
    });

    it('should handle empty source', async () => {
      const source = fromArray<number>([]);
      const sideEffects: number[] = [];

      await pipe(
        source,
        tap((x) => {
          sideEffects.push(x);
        }),
        collectAll,
      );

      expect(sideEffects).toEqual([]);
    });
  });

  describe('side effect execution order', () => {
    it('should execute side effects in order', async () => {
      const source = fromArray([1, 2, 3]);
      const order: string[] = [];

      await pipe(
        source,
        tap((x) => {
          order.push(`first-${x}`);
        }),
        tap((x) => {
          order.push(`second-${x}`);
        }),
        collectAll,
      );

      expect(order).toEqual(['first-1', 'second-1', 'first-2', 'second-2', 'first-3', 'second-3']);
    });

    it('should execute side effect before downstream operators', async () => {
      const source = fromArray([1, 2, 3]);
      const order: string[] = [];

      await pipe(
        source,
        tap((x) => {
          order.push(`tap-${x}`);
        }),
        map((x) => {
          order.push(`map-${x}`);
          return x * 2;
        }),
        collectAll,
      );

      expect(order).toEqual(['tap-1', 'map-1', 'tap-2', 'map-2', 'tap-3', 'map-3']);
    });
  });

  describe('chaining with other operators', () => {
    it('should work with map operator', async () => {
      const source = fromArray([1, 2, 3]);
      const tapped: number[] = [];

      const result = await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        map((x) => x * 2),
        collectAll,
      );

      expect(tapped).toEqual([1, 2, 3]);
      expect(result).toEqual([2, 4, 6]);
    });

    it('should work with filter operator', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const beforeFilter: number[] = [];
      const afterFilter: number[] = [];

      const result = await pipe(
        source,
        tap((x) => {
          beforeFilter.push(x);
        }),
        filter((x) => x % 2 === 0),
        tap((x) => {
          afterFilter.push(x);
        }),
        collectAll,
      );

      expect(beforeFilter).toEqual([1, 2, 3, 4, 5]);
      expect(afterFilter).toEqual([2, 4]);
      expect(result).toEqual([2, 4]);
    });

    it('should work in complex pipeline', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const logs: string[] = [];

      const result = await pipe(
        source,
        tap((x) => logs.push(`input: ${x}`)),
        filter((x) => x > 2),
        tap((x) => logs.push(`after filter: ${x}`)),
        map((x) => x * 2),
        tap((x) => logs.push(`after map: ${x}`)),
        collectAll,
      );

      expect(logs).toEqual([
        'input: 1',
        'input: 2',
        'input: 3',
        'after filter: 3',
        'after map: 6',
        'input: 4',
        'after filter: 4',
        'after map: 8',
        'input: 5',
        'after filter: 5',
        'after map: 10',
      ]);
      expect(result).toEqual([6, 8, 10]);
    });
  });

  describe('use cases', () => {
    it('should be useful for logging', async () => {
      const source = fromArray([1, 2, 3]);
      const logs: string[] = [];

      await pipe(
        source,
        tap((x) => {
          logs.push(`Processing: ${x}`);
        }),
        map((x) => x * 2),
        collectAll,
      );

      expect(logs).toEqual(['Processing: 1', 'Processing: 2', 'Processing: 3']);
    });

    it('should be useful for debugging', async () => {
      const source = fromArray([1, 2, 3]);
      const snapshots: number[] = [];

      const result = await pipe(
        source,
        map((x) => x + 1),
        tap((x) => snapshots.push(x)),
        map((x) => x * 2),
        collectAll,
      );

      expect(snapshots).toEqual([2, 3, 4]);
      expect(result).toEqual([4, 6, 8]);
    });

    it('should support external state updates', async () => {
      const source = fromArray([1, 2, 3]);
      const state = { count: 0, sum: 0 };

      await pipe(
        source,
        tap((x) => {
          state.count++;
          state.sum += x;
        }),
        collectAll,
      );

      expect(state).toEqual({ count: 3, sum: 6 });
    });

    it('should support multiple external effects', async () => {
      const source = fromArray(['a', 'b', 'c']);
      const state1: string[] = [];
      const state2: string[] = [];

      await pipe(
        source,
        tap((x) => state1.push(x)),
        tap((x) => state2.push(x.toUpperCase())),
        collectAll,
      );

      expect(state1).toEqual(['a', 'b', 'c']);
      expect(state2).toEqual(['A', 'B', 'C']);
    });
  });

  describe('falsy values', () => {
    it('should handle null values', async () => {
      const source = fromArray<number | null>([1, null, 3]);
      const tapped: (number | null)[] = [];

      await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([1, null, 3]);
    });

    it('should handle undefined values', async () => {
      const source = fromArray<number | undefined>([1, undefined, 3]);
      const tapped: (number | undefined)[] = [];

      await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([1, undefined, 3]);
    });

    it('should handle zero', async () => {
      const source = fromArray([0, 1, 2]);
      const tapped: number[] = [];

      await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([0, 1, 2]);
    });

    it('should handle false', async () => {
      const source = fromArray([true, false, true]);
      const tapped: boolean[] = [];

      await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([true, false, true]);
    });

    it('should handle empty string', async () => {
      const source = fromArray(['a', '', 'c']);
      const tapped: string[] = [];

      await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual(['a', '', 'c']);
    });
  });

  describe('error handling', () => {
    it('should propagate errors from source', async () => {
      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.next(1);
        sink.error(new Error('Source error'));
      };

      const tapped: number[] = [];

      await expect(
        pipe(
          source,
          tap((x) => {
            tapped.push(x);
          }),
          collectAll,
        ),
      ).rejects.toThrow('Source error');

      expect(tapped).toEqual([1]);
    });

    it('should propagate errors after executing side effects', async () => {
      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.next(1);
        sink.next(2);
        sink.error(new Error('Error after values'));
      };

      const tapped: number[] = [];

      await expect(
        pipe(
          source,
          tap((x) => {
            tapped.push(x);
          }),
          collectAll,
        ),
      ).rejects.toThrow('Error after values');

      expect(tapped).toEqual([1, 2]);
    });
  });

  describe('completion', () => {
    it('should complete when source completes', async () => {
      const source = fromArray([1, 2, 3]);
      const tapped: number[] = [];

      const result = await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should complete immediately on empty source', async () => {
      const source = fromArray<number>([]);
      const tapped: number[] = [];

      const result = await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([]);
      expect(result).toEqual([]);
    });
  });

  describe('complex values', () => {
    it('should handle object values', async () => {
      const source = fromArray([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
      const tapped: { id: number; name: string }[] = [];

      await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('should handle array values', async () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);
      const tapped: number[][] = [];

      await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('should handle nested structures', async () => {
      const source = fromArray([{ user: { id: 1, profile: { name: 'Alice' } } }]);
      const tapped: { user: { id: number; profile: { name: string } } }[] = [];

      await pipe(
        source,
        tap((x) => {
          tapped.push(x);
        }),
        collectAll,
      );

      expect(tapped).toEqual([{ user: { id: 1, profile: { name: 'Alice' } } }]);
    });
  });

  describe('side effect mutations', () => {
    it('should not affect stream even if side effect mutates value', async () => {
      const source = fromArray([{ value: 1 }, { value: 2 }, { value: 3 }]);

      const result = await pipe(
        source,
        tap((x) => {
          x.value = x.value * 2;
        }),
        collectAll,
      );

      expect(result).toEqual([{ value: 2 }, { value: 4 }, { value: 6 }]);
    });

    it('should execute side effect before passing to next operator', async () => {
      const source = fromArray([{ value: 1 }, { value: 2 }]);

      const result = await pipe(
        source,
        tap((x) => {
          x.value = x.value * 2;
        }),
        map((x) => x.value),
        collectAll,
      );

      expect(result).toEqual([2, 4]);
    });
  });
});
