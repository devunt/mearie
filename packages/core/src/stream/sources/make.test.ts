import { describe, it, expect, vi } from 'vitest';
import { make } from './make.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import type { Talkback } from '../types.ts';

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
        start: () => {},
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

    it('should call teardown function on cancel', () => {
      const teardown = vi.fn();
      const source = make<number>((observer) => {
        observer.next(1);
        return teardown;
      });

      let talkback: Talkback;

      source({
        start: (tb) => {
          talkback = tb;
        },
        next: () => {},
        complete: () => {},
      });

      expect(teardown).not.toHaveBeenCalled();

      talkback.cancel();

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
          start: () => {},
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
    it('should not emit after cancellation', () => {
      const source = make<number>((observer) => {
        observer.next(1);
        setTimeout(() => {
          observer.next(2);
        }, 10);
        return () => {};
      });

      const emitted: number[] = [];
      let talkback: Talkback;

      source({
        start: (tb) => {
          talkback = tb;
        },
        next: (value) => {
          emitted.push(value);
          if (value === 1) {
            talkback.cancel();
          }
        },
        complete: () => {},
      });

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
      let talkback: Talkback;

      source({
        start: (tb) => {
          talkback = tb;
          tb.cancel();
        },
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(false);
    });

    it('should not emit if cancelled before subscriber runs', () => {
      const source = make<number>((observer) => {
        observer.next(1);
        return () => {};
      });

      const emitted: number[] = [];

      source({
        start: (tb) => {
          tb.cancel();
        },
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([]);
    });

    it('should call teardown only once on multiple cancels', () => {
      const teardown = vi.fn();
      const source = make<number>(() => teardown);

      let talkback: Talkback;

      source({
        start: (tb) => {
          talkback = tb;
        },
        next: () => {},
        complete: () => {},
      });

      talkback.cancel();
      talkback.cancel();
      talkback.cancel();

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

  describe('talkback', () => {
    it('should provide talkback', () => {
      const source = make<number>(() => () => {});
      let receivedTalkback: Talkback | null = null;

      source({
        start: (tb) => {
          receivedTalkback = tb;
        },
        next: () => {},
        complete: () => {},
      });

      expect(receivedTalkback).not.toBeNull();
      expect(receivedTalkback).toHaveProperty('pull');
      expect(receivedTalkback).toHaveProperty('cancel');
    });

    it('should have pull method that does nothing', () => {
      const source = make<number>(() => () => {});

      source({
        start: (tb) => {
          expect(() => tb.pull()).not.toThrow();
        },
        next: () => {},
        complete: () => {},
      });
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
      let talkback: Talkback;

      source({
        start: (tb) => {
          talkback = tb;
        },
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      await new Promise((resolve) => setTimeout(resolve, 15));
      talkback.cancel();
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
        start: () => {},
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
        start: () => {},
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
        start: () => {},
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
        start: () => {},
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

      let talkback: Talkback;

      source({
        start: (tb) => {
          talkback = tb;
        },
        next: () => {},
        complete: () => {},
      });

      expect(() => talkback.cancel()).toThrow('teardown error');
    });

    it('should handle subscriber that throws', () => {
      const source = make<number>(() => {
        throw new Error('subscriber error');
      });

      expect(() => {
        source({
          start: () => {},
          next: () => {},
          complete: () => {},
        });
      }).toThrow('subscriber error');
    });

    it('should not run subscriber if cancelled before', () => {
      const subscriber = vi.fn(() => () => {});
      const source = make(subscriber);

      source({
        start: (tb) => {
          tb.cancel();
        },
        next: () => {},
        complete: () => {},
      });

      expect(subscriber).not.toHaveBeenCalled();
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
