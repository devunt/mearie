import { describe, it, expect } from 'vitest';
import { pipe } from './pipe.ts';
import type { Operator } from './types.ts';
import { fromArray } from './sources/from-array.ts';
import { map } from './operators/map.ts';
import { filter } from './operators/filter.ts';
import { collectAll } from './sinks/collect-all.ts';

describe('pipe', () => {
  describe('basic functionality', () => {
    it('should return source when called with source only', () => {
      const source = fromArray([1, 2, 3]);

      const result = pipe(source);

      expect(result).toBe(source);
    });

    it('should apply single operator', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([2, 4, 6]);
    });

    it('should apply multiple operators in order', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([4, 8]);
    });

    it('should apply sink as final operation', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, collectAll);

      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('operator composition', () => {
    it('should compose two operators', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x + 1),
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([4, 6, 8]);
    });

    it('should compose three operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5, 6]);

      const result = await pipe(
        source,
        filter((x) => x > 2),
        map((x) => x * 2),
        filter((x) => x < 10),
        collectAll,
      );

      expect(result).toEqual([6, 8]);
    });

    it('should compose four operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        map((x) => x + 1),
        filter((x) => x % 2 === 0),
        map((x) => x * 2),
        map((x) => x - 1),
        collectAll,
      );

      expect(result).toEqual([3, 7, 11]);
    });

    it('should compose five operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const result = await pipe(
        source,
        filter((x) => x > 2),
        map((x) => x * 2),
        filter((x) => x < 15),
        map((x) => x + 1),
        filter((x) => x % 2 === 1),
        collectAll,
      );

      expect(result).toEqual([7, 9, 11, 13, 15]);
    });
  });

  describe('type transformation', () => {
    it('should transform types through operators', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, map(String), collectAll);

      expect(result).toEqual(['1', '2', '3']);
    });

    it('should chain multiple type transformations', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        map(String),
        map((x) => ({ value: x })),
        collectAll,
      );

      expect(result).toEqual([{ value: '2' }, { value: '4' }, { value: '6' }]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([]);
    });

    it('should handle source with single value', async () => {
      const source = fromArray([42]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([84]);
    });

    it('should handle many operators with single value', async () => {
      const source = fromArray([5]);

      const result = await pipe(
        source,
        map((x) => x + 1),
        map((x) => x * 2),
        map((x) => x - 3),
        collectAll,
      );

      expect(result).toEqual([9]);
    });
  });

  describe('operator order', () => {
    it('should apply operators from left to right', async () => {
      const source = fromArray([10]);
      const operations: string[] = [];

      const op1: Operator<number> = (src) => (sink) => {
        return src({
          next: (v) => {
            operations.push('op1');
            sink.next(v);
          },
          complete: () => sink.complete(),
        });
      };

      const op2: Operator<number> = (src) => (sink) => {
        return src({
          next: (v) => {
            operations.push('op2');
            sink.next(v);
          },
          complete: () => sink.complete(),
        });
      };

      const op3: Operator<number> = (src) => (sink) => {
        return src({
          next: (v) => {
            operations.push('op3');
            sink.next(v);
          },
          complete: () => sink.complete(),
        });
      };

      await pipe(source, op1, op2, op3, collectAll);

      expect(operations).toEqual(['op1', 'op2', 'op3']);
    });
  });

  describe('custom operators', () => {
    it('should work with custom operator', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const double: Operator<number> = (src) => (sink) => {
        return src({
          next: (v) => sink.next(v * 2),
          complete: () => sink.complete(),
        });
      };

      const result = await pipe(source, double, collectAll);

      expect(result).toEqual([2, 4, 6, 8, 10]);
    });

    it('should compose custom operators with built-in operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const addOne: Operator<number> = (src) => (sink) => {
        return src({
          next: (v) => sink.next(v + 1),
          complete: () => sink.complete(),
        });
      };

      const result = await pipe(
        source,
        addOne,
        filter((x) => x % 2 === 0),
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([4, 8, 12]);
    });
  });
});
