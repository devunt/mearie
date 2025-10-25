import { describe, it, expect } from 'vitest';
import { merge } from './merge.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { makeSubject } from '../sources/make-subject.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { subscribe } from '../sinks/subscribe.ts';
import { pipe } from '../pipe.ts';
import { map } from './map.ts';

describe('merge', () => {
  describe('basic merging', () => {
    it('should merge two sources', async () => {
      const source1 = fromArray([1, 2, 3]);
      const source2 = fromArray([4, 5, 6]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.toSorted()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should merge three sources', async () => {
      const source1 = fromArray([1, 2]);
      const source2 = fromArray([3, 4]);
      const source3 = fromArray([5, 6]);

      const result = await pipe(merge(source1, source2, source3), collectAll);

      expect(result.toSorted()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should merge single source', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(merge(source), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should merge many sources', async () => {
      const sources = Array.from({ length: 10 }, (_, i) => fromValue(i + 1));

      const result = await pipe(merge(...sources), collectAll);

      expect(result.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe('edge cases', () => {
    it('should complete immediately with no sources', async () => {
      const result = await pipe(merge(), collectAll);

      expect(result).toEqual([]);
    });

    it('should handle empty sources', async () => {
      const source1 = fromArray<number>([]);
      const source2 = fromArray<number>([]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result).toEqual([]);
    });

    it('should merge empty source with non-empty source', async () => {
      const source1 = fromArray<number>([]);
      const source2 = fromArray([1, 2, 3]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle sources with single value', async () => {
      const source1 = fromValue(1);
      const source2 = fromValue(2);
      const source3 = fromValue(3);

      const result = await pipe(merge(source1, source2, source3), collectAll);

      expect(result.toSorted()).toEqual([1, 2, 3]);
    });
  });

  describe('different types', () => {
    it('should merge sources with same type', async () => {
      const source1 = fromArray(['a', 'b']);
      const source2 = fromArray(['c', 'd']);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.toSorted()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('should merge sources with objects', async () => {
      const source1 = fromArray([{ id: 1 }, { id: 2 }]);
      const source2 = fromArray([{ id: 3 }, { id: 4 }]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.length).toBe(4);
      expect(result.map((x) => x.id).toSorted()).toEqual([1, 2, 3, 4]);
    });
  });

  describe('completion', () => {
    it('should complete when all sources complete', async () => {
      const source1 = fromArray([1, 2]);
      const source2 = fromArray([3, 4]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.length).toBe(4);
    });

    it('should wait for all sources to complete', () => {
      const source1 = fromValue(1);
      const source2 = fromValue(2);
      const source3 = fromValue(3);

      let completed = false;

      pipe(merge(source1, source2, source3))({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should complete immediately with no sources', () => {
      let completed = false;

      merge()({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });
  });

  describe('chaining', () => {
    it('should work with map operator', async () => {
      const source1 = fromArray([1, 2]);
      const source2 = fromArray([3, 4]);

      const result = await pipe(
        merge(source1, source2),
        map((x) => x * 2),
        collectAll,
      );

      expect(result.toSorted()).toEqual([2, 4, 6, 8]);
    });

    it('should work as input to operators', async () => {
      const source1 = fromArray([1, 2, 3]);
      const source2 = fromArray([4, 5, 6]);

      const merged = merge(source1, source2);

      const result = await pipe(
        merged,
        map((x) => x + 1),
        collectAll,
      );

      expect(result.toSorted()).toEqual([2, 3, 4, 5, 6, 7]);
    });
  });

  describe('falsy values', () => {
    it('should handle null values', async () => {
      const source1 = fromArray<number | null>([null, 1]);
      const source2 = fromArray<number | null>([2, null]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.filter((x) => x === null).length).toBe(2);
      expect(result.filter((x) => x !== null).toSorted()).toEqual([1, 2]);
    });

    it('should handle undefined values', async () => {
      const source1 = fromArray<number | undefined>([undefined, 1]);
      const source2 = fromArray<number | undefined>([2, undefined]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.filter((x) => x === undefined).length).toBe(2);
      expect(result.filter((x) => x !== undefined).toSorted()).toEqual([1, 2]);
    });

    it('should handle zero', async () => {
      const source1 = fromArray([0, 1]);
      const source2 = fromArray([2, 0]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.toSorted()).toEqual([0, 0, 1, 2]);
    });

    it('should handle false', async () => {
      const source1 = fromArray([false, true]);
      const source2 = fromArray([true, false]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.filter((x) => x === false).length).toBe(2);
      expect(result.filter((x) => x === true).length).toBe(2);
    });

    it('should handle empty string', async () => {
      const source1 = fromArray(['', 'a']);
      const source2 = fromArray(['b', '']);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.filter((x) => x === '').length).toBe(2);
      expect(result.filter((x) => x !== '').toSorted()).toEqual(['a', 'b']);
    });
  });

  describe('mixed source lengths', () => {
    it('should handle sources of different lengths', async () => {
      const source1 = fromArray([1]);
      const source2 = fromArray([2, 3, 4]);
      const source3 = fromArray([5, 6]);

      const result = await pipe(merge(source1, source2, source3), collectAll);

      expect(result.toSorted()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should complete after longest source completes', async () => {
      const source1 = fromValue(1);
      const source2 = fromArray([2, 3, 4, 5]);

      const result = await pipe(merge(source1, source2), collectAll);

      expect(result.length).toBe(5);
    });
  });

  describe('hot and cold source interaction', () => {
    it('should capture emissions to Subject triggered during synchronous source emission', () => {
      const { source: subject$, next } = makeSubject<number>();
      const logs: number[] = [];

      pipe(
        merge(fromArray([1, 2, 3]), subject$),
        subscribe({
          next: (value) => {
            logs.push(value);
            if (value === 1) {
              next(100);
            }
          },
        }),
      );

      expect(logs).toEqual([1, 100, 2, 3]);
    });

    it('should work regardless of merge argument order (cold first)', () => {
      const { source: subject$, next } = makeSubject<number>();
      const logs: number[] = [];

      pipe(
        merge(fromArray([1, 2, 3]), subject$),
        subscribe({
          next: (value) => {
            logs.push(value);
            if (value === 2) {
              next(200);
            }
          },
        }),
      );

      expect(logs).toEqual([1, 2, 200, 3]);
    });

    it('should work regardless of merge argument order (hot first)', () => {
      const { source: subject$, next } = makeSubject<number>();
      const logs: number[] = [];

      pipe(
        merge(subject$, fromArray([1, 2, 3])),
        subscribe({
          next: (value) => {
            logs.push(value);
            if (value === 2) {
              next(200);
            }
          },
        }),
      );

      expect(logs).toEqual([1, 2, 200, 3]);
    });

    it('should handle multiple Subjects with cross-emission', () => {
      const { source: subjectA$, next: nextA } = makeSubject<number>();
      const { source: subjectB$, next: nextB } = makeSubject<number>();
      const logs: number[] = [];

      pipe(
        merge(fromArray([1, 2]), subjectA$, subjectB$),
        subscribe({
          next: (value) => {
            logs.push(value);
            if (value === 1) {
              nextA(10);
            }
            if (value === 2) {
              nextB(20);
            }
          },
        }),
      );

      expect(logs).toEqual([1, 10, 2, 20]);
    });

    it('should handle nested Subject emissions', () => {
      const { source: subject$, next } = makeSubject<number>();
      const logs: number[] = [];

      pipe(
        merge(fromArray([1, 2, 3]), subject$),
        subscribe({
          next: (value) => {
            logs.push(value);
            if (value === 1) {
              next(10);
            }
            if (value === 10) {
              next(100);
            }
          },
        }),
      );

      expect(logs).toEqual([1, 10, 100, 2, 3]);
    });

    it('should preserve emission order with multiple cold sources and Subjects', () => {
      const { source: subject$, next } = makeSubject<string>();
      const logs: string[] = [];

      pipe(
        merge(fromArray(['a', 'b']), subject$, fromArray(['c', 'd'])),
        subscribe({
          next: (value) => {
            logs.push(value);
            if (value === 'b') {
              next('X');
            }
          },
        }),
      );

      expect(logs).toEqual(['a', 'b', 'X', 'c', 'd']);
    });
  });
});
