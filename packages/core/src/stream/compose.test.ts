import { describe, it, expect } from 'vitest';
import { compose } from './compose.ts';
import { fromArray } from './sources/from-array.ts';
import { map } from './operators/map.ts';
import { filter } from './operators/filter.ts';
import { collectAll } from './sinks/collect-all.ts';
import { pipe } from './pipe.ts';

describe('compose', () => {
  describe('single operator', () => {
    it('should return the operator itself', async () => {
      const source = fromArray([1, 2, 3]);
      const op = compose(map((x) => x * 2));

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('two operators', () => {
    it('should compose two operators', async () => {
      const source = fromArray([1, 2, 3]);
      const op = compose(
        map((x) => x + 1),
        map((x) => x * 2),
      );

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual([4, 6, 8]);
    });

    it('should compose map and filter', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const op = compose(
        map((x) => x * 2),
        filter((x) => x > 5),
      );

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual([6, 8, 10]);
    });
  });

  describe('three operators', () => {
    it('should compose three operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const op = compose(
        filter((x) => x > 2),
        map((x) => x * 2),
        filter((x) => x < 10),
      );

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual([6, 8]);
    });
  });

  describe('four operators', () => {
    it('should compose four operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const op = compose(
        map((x) => x + 1),
        filter((x) => x % 2 === 0),
        map((x) => x * 2),
        map((x) => x - 1),
      );

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual([3, 7, 11]);
    });
  });

  describe('reusability', () => {
    it('should allow composed operator to be reused', async () => {
      const op = compose(
        map((x: number) => x * 2),
        filter((x) => x > 5),
      );

      const result1 = await pipe(fromArray([1, 2, 3, 4]), op, collectAll);
      const result2 = await pipe(fromArray([3, 4, 5]), op, collectAll);

      expect(result1).toEqual([6, 8]);
      expect(result2).toEqual([6, 8, 10]);
    });

    it('should compose composed operators', async () => {
      const op1 = compose(
        map((x: number) => x + 1),
        map((x) => x * 2),
      );
      const op2 = compose(
        filter((x: number) => x > 5),
        map((x) => x - 1),
      );
      const combined = compose(op1, op2);

      const result = await pipe(fromArray([1, 2, 3, 4]), combined, collectAll);

      expect(result).toEqual([5, 7, 9]);
    });
  });

  describe('type transformation', () => {
    it('should transform types through composed operators', async () => {
      const source = fromArray([1, 2, 3]);
      const op = compose(
        map((x: number) => x * 2),
        map(String),
      );

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual(['2', '4', '6']);
    });

    it('should chain multiple type transformations', async () => {
      const source = fromArray([1, 2, 3]);
      const op = compose(
        map((x: number) => x * 2),
        map(String),
        map((x) => ({ value: x })),
      );

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual([{ value: '2' }, { value: '4' }, { value: '6' }]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty source', async () => {
      const source = fromArray<number>([]);
      const op = compose(
        map((x) => x * 2),
        filter((x) => x > 0),
      );

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual([]);
    });

    it('should handle filtering that removes all values', async () => {
      const source = fromArray([1, 2, 3]);
      const op = compose(
        map((x) => x * 2),
        filter((x) => x > 100),
      );

      const result = await pipe(source, op, collectAll);

      expect(result).toEqual([]);
    });
  });

  describe('composition with pipe', () => {
    it('should work seamlessly with pipe', async () => {
      const preprocess = compose(
        map((x: number) => x * 2),
        filter((x) => x > 5),
      );

      const result = await pipe(
        fromArray([1, 2, 3, 4, 5]),
        preprocess,
        map((x) => x + 1),
        collectAll,
      );

      expect(result).toEqual([7, 9, 11]);
    });

    it('should allow multiple composed operators in pipe', async () => {
      const preprocess = compose(
        filter((x: number) => x > 2),
        map((x) => x * 2),
      );
      const postprocess = compose(
        filter((x: number) => x < 10),
        map((x) => x + 1),
      );

      const result = await pipe(
        fromArray([1, 2, 3, 4, 5]),
        preprocess,
        postprocess,
        collectAll,
      );

      expect(result).toEqual([7, 9]);
    });
  });
});
