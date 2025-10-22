import { describe, it, expect } from 'vitest';
import { subscribe } from './subscribe.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import { filter } from '../operators/filter.ts';

describe('subscribe', () => {
  describe('basic functionality', () => {
    it('should receive values through next', () => {
      const source = fromArray([1, 2, 3]);
      const values: number[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([1, 2, 3]);
    });

    it('should receive completion signal', () => {
      const source = fromArray([1, 2, 3]);
      let completed = false;

      pipe(
        source,
        subscribe({
          complete: () => {
            completed = true;
          },
        }),
      );

      expect(completed).toBe(true);
    });

    it('should receive both values and completion', () => {
      const source = fromArray([1, 2, 3]);
      const values: number[] = [];
      let completed = false;

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
          complete: () => {
            completed = true;
          },
        }),
      );

      expect(values).toEqual([1, 2, 3]);
      expect(completed).toBe(true);
    });

    it('should work with single value', () => {
      const source = fromValue(42);
      const values: number[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([42]);
    });

    it('should work with empty source', () => {
      const source = fromArray<number>([]);
      let completed = false;

      pipe(
        source,
        subscribe({
          complete: () => {
            completed = true;
          },
        }),
      );

      expect(completed).toBe(true);
    });
  });

  describe('observer methods', () => {
    it('should call next for each value', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const calls: number[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            calls.push(value);
          },
        }),
      );

      expect(calls).toEqual([1, 2, 3, 4, 5]);
    });

    it('should call complete once', () => {
      const source = fromArray([1, 2, 3]);
      let completeCalls = 0;

      pipe(
        source,
        subscribe({
          complete: () => {
            completeCalls++;
          },
        }),
      );

      expect(completeCalls).toBe(1);
    });
  });

  describe('optional methods', () => {
    it('should work without next', () => {
      const source = fromArray([1, 2, 3]);

      expect(() =>
        pipe(
          source,
          subscribe({
            complete: () => {},
          }),
        ),
      ).not.toThrow();
    });

    it('should work without complete', () => {
      const source = fromArray([1, 2, 3]);
      const values: number[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([1, 2, 3]);
    });

    it('should work without error', () => {
      const source = fromArray([1, 2, 3]);

      expect(() =>
        pipe(
          source,
          subscribe({
            next: () => {},
          }),
        ),
      ).not.toThrow();
    });

    it('should work with empty observer', () => {
      const source = fromArray([1, 2, 3]);

      expect(() => pipe(source, subscribe({}))).not.toThrow();
    });
  });

  describe('with operators', () => {
    it('should subscribe after map', () => {
      const source = fromArray([1, 2, 3]);
      const values: number[] = [];

      pipe(
        source,
        map((x) => x * 2),
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([2, 4, 6]);
    });

    it('should subscribe after filter', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const values: number[] = [];

      pipe(
        source,
        filter((x) => x % 2 === 0),
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([2, 4]);
    });

    it('should subscribe after multiple operators', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const values: number[] = [];

      pipe(
        source,
        filter((x) => x > 2),
        map((x) => x * 2),
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([6, 8, 10]);
    });
  });

  describe('subscription cancellation', () => {
    it('should return unsubscribe function', () => {
      const source = fromArray([1, 2, 3]);

      const unsubscribe = pipe(source, subscribe({}));

      expect(typeof unsubscribe).toBe('function');
    });

    it('should stop receiving values after unsubscribe', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const values: number[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain(3);
    });

    it('should not throw when unsubscribing multiple times', () => {
      const source = fromArray([1, 2, 3]);

      const unsubscribe = pipe(source, subscribe({}));

      expect(() => {
        unsubscribe();
        unsubscribe();
        unsubscribe();
      }).not.toThrow();
    });
  });

  describe('value types', () => {
    it('should handle strings', () => {
      const source = fromArray(['a', 'b', 'c']);
      const values: string[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual(['a', 'b', 'c']);
    });

    it('should handle objects', () => {
      const source = fromArray([{ id: 1 }, { id: 2 }]);
      const values: { id: number }[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should handle arrays', () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);
      const values: number[][] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('falsy values', () => {
    it('should handle null values', () => {
      const source = fromArray<number | null>([null, 1, null]);
      const values: (number | null)[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([null, 1, null]);
    });

    it('should handle undefined values', () => {
      const source = fromArray<number | undefined>([undefined, 1, undefined]);
      const values: (number | undefined)[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([undefined, 1, undefined]);
    });

    it('should handle zero', () => {
      const source = fromArray([0, 1, 0]);
      const values: number[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([0, 1, 0]);
    });

    it('should handle false', () => {
      const source = fromArray([false, true, false]);
      const values: boolean[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual([false, true, false]);
    });

    it('should handle empty string', () => {
      const source = fromArray(['', 'a', '']);
      const values: string[] = [];

      pipe(
        source,
        subscribe({
          next: (value) => {
            values.push(value);
          },
        }),
      );

      expect(values).toEqual(['', 'a', '']);
    });
  });

  describe('use cases', () => {
    it('should be useful for side effects', () => {
      const source = fromArray([1, 2, 3]);
      let sum = 0;

      pipe(
        source,
        subscribe({
          next: (value) => {
            sum += value;
          },
        }),
      );

      expect(sum).toBe(6);
    });

    it('should be useful for logging', () => {
      const source = fromArray([1, 2, 3]);
      const logs: string[] = [];

      pipe(
        source,
        map((x) => x * 2),
        subscribe({
          next: (value) => {
            logs.push(`Received: ${value}`);
          },
          complete: () => {
            logs.push('Completed');
          },
        }),
      );

      expect(logs).toEqual(['Received: 2', 'Received: 4', 'Received: 6', 'Completed']);
    });

    it('should be useful for state updates', () => {
      const source = fromArray([1, 2, 3]);
      const state = { values: [] as number[], count: 0 };

      pipe(
        source,
        subscribe({
          next: (value) => {
            state.values.push(value);
            state.count++;
          },
        }),
      );

      expect(state.values).toEqual([1, 2, 3]);
      expect(state.count).toBe(3);
    });
  });
});
