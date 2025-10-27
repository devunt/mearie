import { describe, it, expect, vi } from 'vitest';
import { make } from './make.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';

describe('make', () => {
  describe('basic functionality', () => {
    it('should emit values through next', async () => {
      const source = make<number>((observer) => {
        observer.next(1);
        observer.next(2);
        observer.next(3);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should emit single value', async () => {
      const source = make<number>((observer) => {
        observer.next(42);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([42]);
    });

    it('should complete without emitting values', () => {
      const source = make<number>((observer) => {
        observer.complete();
        return () => {};
      });

      let completed = false;
      const emitted: number[] = [];

      source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {
          completed = true;
        },
      });

      expect(emitted).toEqual([]);
      expect(completed).toBe(true);
    });

    it('should call teardown function on unsubscribe', () => {
      const teardown = vi.fn();
      const source = make<number>((observer) => {
        observer.next(1);
        return teardown;
      });

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      expect(teardown).not.toHaveBeenCalled();

      subscription.unsubscribe();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('should call teardown on asynchronous complete', async () => {
      const teardown = vi.fn();
      const source = make<number>((observer) => {
        observer.next(1);
        setTimeout(() => {
          observer.complete();
        }, 10);
        return teardown;
      });

      await new Promise<void>((resolve) => {
        source({
          next: () => {},
          complete: () => {
            resolve();
          },
        });
      });

      expect(teardown).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancellation', () => {
    it('should not emit after cancellation', async () => {
      const source = make<number>((observer) => {
        observer.next(1);
        setTimeout(() => {
          observer.next(2);
        }, 10);
        return () => {};
      });

      const emitted: number[] = [];

      const subscription = source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([1]);

      subscription.unsubscribe();

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(emitted).toEqual([1]);
    });

    it('should not complete after cancellation', () => {
      const source = make<number>((observer) => {
        observer.next(1);
        setTimeout(() => {
          observer.complete();
        }, 10);
        return () => {};
      });

      let completed = false;

      const subscription = source({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      subscription.unsubscribe();

      expect(completed).toBe(false);
    });

    it('should not emit if cancelled immediately', () => {
      const source = make<number>((observer) => {
        observer.next(1);
        return () => {};
      });

      const emitted: number[] = [];

      const subscription = source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      subscription.unsubscribe();

      expect(emitted).toEqual([1]);
    });

    it('should call teardown only once on multiple unsubscribes', () => {
      const teardown = vi.fn();
      const source = make<number>(() => teardown);

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      subscription.unsubscribe();
      subscription.unsubscribe();
      subscription.unsubscribe();

      expect(teardown).toHaveBeenCalledTimes(1);
    });
  });

  describe('value types', () => {
    it('should emit strings', async () => {
      const source = make<string>((observer) => {
        observer.next('a');
        observer.next('b');
        observer.next('c');
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should emit objects', async () => {
      const source = make<{ id: number }>((observer) => {
        observer.next({ id: 1 });
        observer.next({ id: 2 });
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should emit arrays', async () => {
      const source = make<number[]>((observer) => {
        observer.next([1, 2]);
        observer.next([3, 4]);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('falsy values', () => {
    it('should emit null', async () => {
      const source = make<number | null>((observer) => {
        observer.next(1);
        observer.next(null);
        observer.next(2);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([1, null, 2]);
    });

    it('should emit undefined', async () => {
      const source = make<number | undefined>((observer) => {
        observer.next(1);
        // eslint-disable-next-line unicorn/no-useless-undefined
        observer.next(undefined);
        observer.next(2);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([1, undefined, 2]);
    });

    it('should emit zero', async () => {
      const source = make<number>((observer) => {
        observer.next(0);
        observer.next(1);
        observer.next(0);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([0, 1, 0]);
    });

    it('should emit false', async () => {
      const source = make<boolean>((observer) => {
        observer.next(false);
        observer.next(true);
        observer.next(false);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([false, true, false]);
    });

    it('should emit empty string', async () => {
      const source = make<string>((observer) => {
        observer.next('');
        observer.next('a');
        observer.next('');
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual(['', 'a', '']);
    });
  });

  describe('with operators', () => {
    it('should work with map', async () => {
      const source = make<number>((observer) => {
        observer.next(1);
        observer.next(2);
        observer.next(3);
        observer.complete();
        return () => {};
      });

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([2, 4, 6]);
    });

    it('should work with multiple operators', async () => {
      const source = make<number>((observer) => {
        observer.next(1);
        observer.next(2);
        observer.next(3);
        observer.complete();
        return () => {};
      });

      const result = await pipe(
        source,
        map((x) => x * 2),
        map((x) => x + 1),
        collectAll,
      );

      expect(result).toEqual([3, 5, 7]);
    });
  });

  describe('subscription', () => {
    it('should provide subscription', () => {
      const source = make<number>(() => () => {});

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      expect(subscription).not.toBeNull();
      expect(subscription).toHaveProperty('unsubscribe');
    });

    it('should have unsubscribe method that does not throw', () => {
      const source = make<number>(() => () => {});

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('asynchronous behavior', () => {
    it('should handle async emissions', async () => {
      const source = make<number>((observer) => {
        setTimeout(() => observer.next(1), 10);
        setTimeout(() => observer.next(2), 20);
        setTimeout(() => observer.complete(), 30);
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([1, 2]);
    });

    it('should handle async with cancellation', async () => {
      const source = make<number>((observer) => {
        const timeout1 = setTimeout(() => observer.next(1), 10);
        const timeout2 = setTimeout(() => observer.next(2), 20);

        return () => {
          clearTimeout(timeout1);
          clearTimeout(timeout2);
        };
      });

      const emitted: number[] = [];

      const subscription = source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      await new Promise((resolve) => setTimeout(resolve, 15));
      subscription.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(emitted).toEqual([1]);
    });
  });

  describe('completion behavior', () => {
    it('should not emit after complete', () => {
      const source = make<number>((observer) => {
        observer.next(1);
        observer.complete();
        observer.next(2);
        return () => {};
      });

      const emitted: number[] = [];

      source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([1]);
    });

    it('should complete only once', () => {
      const source = make<number>((observer) => {
        observer.next(1);
        observer.complete();
        observer.complete();
        observer.complete();
        return () => {};
      });

      let completeCount = 0;

      source({
        next: () => {},
        complete: () => {
          completeCount++;
        },
      });

      expect(completeCount).toBe(1);
    });

    it('should not call teardown on synchronous complete', () => {
      const teardown = vi.fn();
      const source = make<number>((observer) => {
        observer.complete();
        return teardown;
      });

      source({
        next: () => {},
        complete: () => {},
      });

      expect(teardown).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle immediate completion', () => {
      const source = make<number>((observer) => {
        observer.complete();
        return () => {};
      });

      let completed = false;

      source({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should handle many values', async () => {
      const source = make<number>((observer) => {
        for (let i = 0; i < 1000; i++) {
          observer.next(i);
        }
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result.length).toBe(1000);
      expect(result[0]).toBe(0);
      expect(result[999]).toBe(999);
    });

    it('should handle complex objects', async () => {
      const source = make<{ id: number; data: { nested: string } }>((observer) => {
        observer.next({ id: 1, data: { nested: 'a' } });
        observer.next({ id: 2, data: { nested: 'b' } });
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([
        { id: 1, data: { nested: 'a' } },
        { id: 2, data: { nested: 'b' } },
      ]);
    });

    it('should handle teardown that throws', () => {
      const source = make<number>(() => {
        return () => {
          throw new Error('teardown error');
        };
      });

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      expect(() => subscription.unsubscribe()).toThrow('teardown error');
    });

    it('should handle subscriber that throws', () => {
      const source = make<number>(() => {
        throw new Error('subscriber error');
      });

      expect(() => {
        source({
          next: () => {},
          complete: () => {},
        });
      }).toThrow('subscriber error');
    });

    it('should handle NaN values', async () => {
      const source = make<number>((observer) => {
        observer.next(Number.NaN);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result[0]).toBeNaN();
    });

    it('should handle Infinity values', async () => {
      const source = make<number>((observer) => {
        observer.next(Infinity);
        observer.next(-Infinity);
        observer.complete();
        return () => {};
      });

      const result = await collectAll(source);

      expect(result).toEqual([Infinity, -Infinity]);
    });
  });
});
