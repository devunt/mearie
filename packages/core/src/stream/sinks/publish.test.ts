import { describe, it, expect } from 'vitest';
import { publish } from './publish.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import type { Sink } from '../types.ts';

describe('publish', () => {
  describe('basic functionality', () => {
    it('should consume source without storing values', () => {
      const source = fromArray([1, 2, 3]);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should pull from source', () => {
      let pullCalled = false;

      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {
            pullCalled = true;
          },
          cancel: () => {},
        });
        sink.complete();
      };

      publish(source);

      expect(pullCalled).toBe(true);
    });

    it('should consume single value', () => {
      const source = fromValue(42);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should consume empty source', () => {
      const source = fromArray<number>([]);

      const result = publish(source);

      expect(result).toBeUndefined();
    });
  });

  describe('with operators', () => {
    it('should consume after map', () => {
      const source = fromArray([1, 2, 3]);

      const result = pipe(
        source,
        map((x) => x * 2),
        publish,
      );

      expect(result).toBeUndefined();
    });

    it('should trigger operator side effects', () => {
      const source = fromArray([1, 2, 3]);
      const sideEffects: number[] = [];

      pipe(
        source,
        map((x) => {
          sideEffects.push(x);
          return x * 2;
        }),
        publish,
      );

      expect(sideEffects).toEqual([1, 2, 3]);
    });
  });

  describe('side effects', () => {
    it('should trigger source execution', () => {
      let sourceExecuted = false;

      const source = (sink: Sink<number>) => {
        sourceExecuted = true;
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.complete();
      };

      publish(source);

      expect(sourceExecuted).toBe(true);
    });

    it('should consume all values', () => {
      const emittedValues: number[] = [];

      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        for (let i = 1; i <= 5; i++) {
          emittedValues.push(i);
          sink.next(i);
        }
        sink.complete();
      };

      publish(source);

      expect(emittedValues).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('completion', () => {
    it('should handle completion', () => {
      const source = fromArray([1, 2, 3]);

      expect(() => publish(source)).not.toThrow();
    });

    it('should handle immediate completion', () => {
      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.complete();
      };

      expect(() => publish(source)).not.toThrow();
    });
  });

  describe('value types', () => {
    it('should consume strings', () => {
      const source = fromArray(['a', 'b', 'c']);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should consume objects', () => {
      const source = fromArray([{ id: 1 }, { id: 2 }]);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should consume arrays', () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);

      const result = publish(source);

      expect(result).toBeUndefined();
    });
  });

  describe('falsy values', () => {
    it('should consume null values', () => {
      const source = fromArray<number | null>([null, 1, null]);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should consume undefined values', () => {
      const source = fromArray<number | undefined>([undefined, 1, undefined]);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should consume zero', () => {
      const source = fromArray([0, 1, 0]);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should consume false', () => {
      const source = fromArray([false, true, false]);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should consume empty string', () => {
      const source = fromArray(['', 'a', '']);

      const result = publish(source);

      expect(result).toBeUndefined();
    });
  });

  describe('large sources', () => {
    it('should consume large number of values', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const source = fromArray(largeArray);

      const result = publish(source);

      expect(result).toBeUndefined();
    });

    it('should consume very large number of values', () => {
      const veryLargeArray = Array.from({ length: 10_000 }, (_, i) => i);
      const source = fromArray(veryLargeArray);

      const result = publish(source);

      expect(result).toBeUndefined();
    });
  });

  describe('use cases', () => {
    it('should be useful for triggering side effects', () => {
      const source = fromArray([1, 2, 3]);
      let sum = 0;

      pipe(
        source,
        map((x) => {
          sum += x;
          return x;
        }),
        publish,
      );

      expect(sum).toBe(6);
    });

    it('should be useful for fire-and-forget operations', () => {
      const source = fromArray([1, 2, 3]);
      const results: number[] = [];

      pipe(
        source,
        map((x) => {
          results.push(x * 2);
          return x;
        }),
        publish,
      );

      expect(results).toEqual([2, 4, 6]);
    });

    it('should execute pipeline without collecting results', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const processed: number[] = [];

      pipe(
        source,
        map((x) => x * 2),
        map((x) => {
          processed.push(x);
          return x;
        }),
        publish,
      );

      expect(processed).toEqual([2, 4, 6, 8, 10]);
    });
  });

  describe('synchronous behavior', () => {
    it('should execute synchronously', () => {
      let executed = false;

      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        executed = true;
        sink.complete();
      };

      publish(source);

      expect(executed).toBe(true);
    });

    it('should complete before returning', () => {
      let completed = false;

      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.next(1);
        sink.next(2);
        sink.complete();
        completed = true;
      };

      publish(source);

      expect(completed).toBe(true);
    });
  });
});
