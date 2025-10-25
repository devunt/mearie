import { describe, it, expect } from 'vitest';
import { fromPromise } from './from-promise.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import type { Subscription } from '../types.ts';

describe('fromPromise', () => {
  describe('basic functionality', () => {
    it('should emit resolved promise value', async () => {
      const promise = Promise.resolve(42);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([42]);
    });

    it('should emit string value', async () => {
      const promise = Promise.resolve('hello');
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual(['hello']);
    });

    it('should emit object value', async () => {
      const promise = Promise.resolve({ id: 1, name: 'test' });
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([{ id: 1, name: 'test' }]);
    });

    it('should emit array value', async () => {
      const promise = Promise.resolve([1, 2, 3]);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([[1, 2, 3]]);
    });

    it('should complete after emitting value', async () => {
      const promise = Promise.resolve(1);
      const source = fromPromise(promise);
      let completed = false;

      await new Promise<void>((resolve) => {
        source({
          next: () => {},
          complete: () => {
            completed = true;
            resolve();
          },
        });
      });

      expect(completed).toBe(true);
    });
  });

  describe('promise rejection', () => {
    it('should complete without emitting on rejection', async () => {
      const promise = Promise.reject(new Error('test error'));
      const source = fromPromise(promise);
      const emitted: unknown[] = [];
      let completed = false;

      await new Promise<void>((resolve) => {
        source({
          next: (value) => {
            emitted.push(value);
          },
          complete: () => {
            completed = true;
            resolve();
          },
        });
      });

      expect(emitted).toEqual([]);
      expect(completed).toBe(true);
    });

    it('should complete on promise rejection with string', async () => {
      const promise = Promise.reject('error string');
      const source = fromPromise(promise);
      let completed = false;

      await new Promise<void>((resolve) => {
        source({
          next: () => {},
          complete: () => {
            completed = true;
            resolve();
          },
        });
      });

      expect(completed).toBe(true);
    });

    it('should complete on promise rejection with null', async () => {
      const promise = Promise.reject(null);
      const source = fromPromise(promise);
      let completed = false;

      await new Promise<void>((resolve) => {
        source({
          next: () => {},
          complete: () => {
            completed = true;
            resolve();
          },
        });
      });

      expect(completed).toBe(true);
    });
  });

  describe('cancellation', () => {
    it('should not emit if cancelled before promise resolves', async () => {
      let resolvePromise: (value: number) => void;
      const promise = new Promise<number>((resolve) => {
        resolvePromise = resolve;
      });

      const source = fromPromise(promise);
      const emitted: number[] = [];

      const subscription = source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      subscription.unsubscribe();

      resolvePromise!(42);
      await promise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(emitted).toEqual([]);
    });

    it('should not emit if cancelled after subscription', async () => {
      let resolvePromise: (value: number) => void;
      const promise = new Promise<number>((resolve) => {
        resolvePromise = resolve;
      });

      const source = fromPromise(promise);
      const emitted: number[] = [];

      const subscription = source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      subscription.unsubscribe();
      resolvePromise!(42);
      await promise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(emitted).toEqual([]);
    });

    it('should not complete if cancelled', async () => {
      let resolvePromise: (value: number) => void;
      const promise = new Promise<number>((resolve) => {
        resolvePromise = resolve;
      });

      const source = fromPromise(promise);
      let completed = false;

      const subscription = source({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      subscription.unsubscribe();

      resolvePromise!(42);
      await promise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(completed).toBe(false);
    });
  });

  describe('already resolved promise', () => {
    it('should handle already resolved promise', async () => {
      const promise = Promise.resolve(100);
      await promise;

      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([100]);
    });

    it('should handle already rejected promise', async () => {
      const promise = Promise.reject(new Error('test'));

      try {
        await promise;
      } catch {}

      const source = fromPromise(promise);
      const emitted: unknown[] = [];

      await new Promise<void>((resolve) => {
        source({
          next: (value) => {
            emitted.push(value);
          },
          complete: () => {
            resolve();
          },
        });
      });

      expect(emitted).toEqual([]);
    });
  });

  describe('falsy values', () => {
    it('should emit null', async () => {
      const promise = Promise.resolve(null);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([null]);
    });

    it('should emit undefined', async () => {
      const promise = Promise.resolve(undefined);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([undefined]);
    });

    it('should emit zero', async () => {
      const promise = Promise.resolve(0);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([0]);
    });

    it('should emit false', async () => {
      const promise = Promise.resolve(false);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([false]);
    });

    it('should emit empty string', async () => {
      const promise = Promise.resolve('');
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual(['']);
    });
  });

  describe('with operators', () => {
    it('should work with map', async () => {
      const promise = Promise.resolve(10);
      const source = fromPromise(promise);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([20]);
    });

    it('should work with multiple operators', async () => {
      const promise = Promise.resolve(5);
      const source = fromPromise(promise);

      const result = await pipe(
        source,
        map((x) => x * 2),
        map((x) => x + 10),
        collectAll,
      );

      expect(result).toEqual([20]);
    });
  });

  describe('subscription', () => {
    it('should provide subscription', async () => {
      const promise = Promise.resolve(42);
      const source = fromPromise(promise);

      const subscription = await new Promise<Subscription>((resolve) => {
        const sub = source({
          next: () => {},
          complete: () => {
            resolve(sub);
          },
        });
      });

      expect(subscription).not.toBeNull();
      expect(subscription).toHaveProperty('unsubscribe');
    });

    it('should have unsubscribe method that does not throw', () => {
      const promise = Promise.resolve(42);
      const source = fromPromise(promise);

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('async behavior', () => {
    it('should emit value asynchronously', async () => {
      const promise = Promise.resolve(1);
      const source = fromPromise(promise);
      const emitted: number[] = [];

      source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([]);

      await promise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(emitted).toEqual([1]);
    });

    it('should complete asynchronously', async () => {
      const promise = Promise.resolve(1);
      const source = fromPromise(promise);
      let completed = false;

      source({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(false);

      await promise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(completed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle promise with complex object', async () => {
      const complexObject = {
        id: 1,
        nested: {
          value: 'test',
          array: [1, 2, 3],
          deep: {
            property: true,
          },
        },
      };
      const promise = Promise.resolve(complexObject);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([complexObject]);
    });

    it('should handle promise with NaN', async () => {
      const promise = Promise.resolve(Number.NaN);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result[0]).toBeNaN();
    });

    it('should handle promise with Infinity', async () => {
      const promise = Promise.resolve(Infinity);
      const source = fromPromise(promise);

      const result = await collectAll(source);

      expect(result).toEqual([Infinity]);
    });

    it('should handle cancellation immediately after subscription', async () => {
      const promise = Promise.resolve(42);
      const source = fromPromise(promise);
      const emitted: number[] = [];

      const subscription = source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      subscription.unsubscribe();

      await promise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(emitted).toEqual([]);
    });
  });
});
