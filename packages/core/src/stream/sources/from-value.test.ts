import { describe, it, expect } from 'vitest';
import { fromValue } from './from-value.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import { filter } from '../operators/filter.ts';
import type { Talkback } from '../types.ts';

describe('fromValue', () => {
  describe('basic functionality', () => {
    it('should emit single value', async () => {
      const source = fromValue(42);

      const result = await collectAll(source);

      expect(result).toEqual([42]);
    });

    it('should emit and complete', () => {
      const source = fromValue(1);
      let completed = false;

      source({
        start: () => {},
        next: () => {},
        error: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });
  });

  describe('value types', () => {
    it('should emit number', async () => {
      const source = fromValue(123);

      const result = await collectAll(source);

      expect(result).toEqual([123]);
    });

    it('should emit string', async () => {
      const source = fromValue('hello');

      const result = await collectAll(source);

      expect(result).toEqual(['hello']);
    });

    it('should emit object', async () => {
      const source = fromValue({ id: 1, name: 'test' });

      const result = await collectAll(source);

      expect(result).toEqual([{ id: 1, name: 'test' }]);
    });

    it('should emit array', async () => {
      const source = fromValue([1, 2, 3]);

      const result = await collectAll(source);

      expect(result).toEqual([[1, 2, 3]]);
    });

    it('should emit boolean', async () => {
      const source = fromValue(true);

      const result = await collectAll(source);

      expect(result).toEqual([true]);
    });
  });

  describe('falsy values', () => {
    it('should emit null', async () => {
      const source = fromValue(null);

      const result = await collectAll(source);

      expect(result).toEqual([null]);
    });

    it('should emit undefined', async () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const source = fromValue(undefined);

      const result = await collectAll(source);

      expect(result).toEqual([undefined]);
    });

    it('should emit zero', async () => {
      const source = fromValue(0);

      const result = await collectAll(source);

      expect(result).toEqual([0]);
    });

    it('should emit false', async () => {
      const source = fromValue(false);

      const result = await collectAll(source);

      expect(result).toEqual([false]);
    });

    it('should emit empty string', async () => {
      const source = fromValue('');

      const result = await collectAll(source);

      expect(result).toEqual(['']);
    });
  });

  describe('with operators', () => {
    it('should work with map', async () => {
      const source = fromValue(5);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([10]);
    });

    it('should work with filter that passes', async () => {
      const source = fromValue(4);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([4]);
    });

    it('should work with filter that fails', async () => {
      const source = fromValue(3);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([]);
    });

    it('should work with multiple operators', async () => {
      const source = fromValue(10);

      const result = await pipe(
        source,
        map((x) => x + 5),
        filter((x) => x > 10),
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([30]);
    });
  });

  describe('completion', () => {
    it('should complete after emitting value', () => {
      const source = fromValue(42);
      let completed = false;

      source({
        start: () => {},
        next: () => {},
        error: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should emit value before completing', () => {
      const source = fromValue(42);
      const events: string[] = [];

      source({
        start: () => {
          events.push('start');
        },
        next: (value) => {
          events.push(`next:${value}`);
        },
        error: () => {},
        complete: () => {
          events.push('complete');
        },
      });

      expect(events).toEqual(['start', 'next:42', 'complete']);
    });
  });

  describe('cancellation', () => {
    it('should not emit when cancelled before emission', () => {
      const source = fromValue(42);
      const emitted: number[] = [];

      source({
        start: (tb) => {
          tb.cancel();
        },
        next: (value) => {
          emitted.push(value);
        },
        error: () => {},
        complete: () => {},
      });

      expect(emitted).toEqual([]);
    });

    it('should not complete when cancelled', () => {
      const source = fromValue(42);
      let completed = false;

      source({
        start: (tb) => {
          tb.cancel();
        },
        next: () => {},
        error: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(false);
    });
  });

  describe('talkback', () => {
    it('should provide talkback', () => {
      const source = fromValue(42);
      let receivedTalkback: Talkback | null = null;

      source({
        start: (tb) => {
          receivedTalkback = tb;
        },
        next: () => {},
        error: () => {},
        complete: () => {},
      });

      expect(receivedTalkback).not.toBeNull();
      expect(receivedTalkback).toHaveProperty('pull');
      expect(receivedTalkback).toHaveProperty('cancel');
    });

    it('should have pull method that does nothing', () => {
      const source = fromValue(42);

      source({
        start: (tb) => {
          expect(() => tb.pull()).not.toThrow();
        },
        next: () => {},
        error: () => {},
        complete: () => {},
      });
    });
  });

  describe('complex values', () => {
    it('should emit nested object', async () => {
      const source = fromValue({
        user: { id: 1, profile: { name: 'Alice', age: 30 } },
      });

      const result = await collectAll(source);

      expect(result).toEqual([{ user: { id: 1, profile: { name: 'Alice', age: 30 } } }]);
    });

    it('should emit nested array', async () => {
      const source = fromValue([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);

      const result = await collectAll(source);

      expect(result).toEqual([
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      ]);
    });

    it('should emit deeply nested structure', async () => {
      const source = fromValue({ a: { b: { c: { d: { e: 'deep' } } } } });

      const result = await collectAll(source);

      expect(result).toEqual([{ a: { b: { c: { d: { e: 'deep' } } } } }]);
    });
  });

  describe('synchronous behavior', () => {
    it('should emit value synchronously', () => {
      const source = fromValue(42);
      const emitted: number[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        error: () => {},
        complete: () => {},
      });

      expect(emitted).toEqual([42]);
    });

    it('should complete synchronously', () => {
      const source = fromValue(42);
      let completed = false;

      source({
        start: () => {},
        next: () => {},
        error: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should emit NaN', async () => {
      const source = fromValue(Number.NaN);

      const result = await collectAll(source);

      expect(result[0]).toBeNaN();
    });

    it('should emit Infinity', async () => {
      const source = fromValue(Infinity);

      const result = await collectAll(source);

      expect(result).toEqual([Infinity]);
    });

    it('should emit -Infinity', async () => {
      const source = fromValue(-Infinity);

      const result = await collectAll(source);

      expect(result).toEqual([-Infinity]);
    });

    it('should emit empty object', async () => {
      const source = fromValue({});

      const result = await collectAll(source);

      expect(result).toEqual([{}]);
    });

    it('should emit empty array', async () => {
      const source = fromValue([]);

      const result = await collectAll(source);

      expect(result).toEqual([[]]);
    });
  });

  describe('reference preservation', () => {
    it('should preserve object reference', async () => {
      const obj = { id: 1, name: 'test' };
      const source = fromValue(obj);

      const result = await collectAll(source);

      expect(result[0]).toBe(obj);
    });

    it('should preserve array reference', async () => {
      const arr = [1, 2, 3];
      const source = fromValue(arr);

      const result = await collectAll(source);

      expect(result[0]).toBe(arr);
    });
  });

  describe('use cases', () => {
    it('should be useful for wrapping constants', async () => {
      const CONSTANT = 42;
      const source = fromValue(CONSTANT);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([84]);
    });

    it('should be useful for initial values', async () => {
      const initialState = { count: 0, items: [] };
      const source = fromValue(initialState);

      const result = await collectAll(source);

      expect(result).toEqual([{ count: 0, items: [] }]);
    });

    it('should be useful for error values', async () => {
      const error = new Error('Test error');
      const source = fromValue(error);

      const result = await collectAll(source);

      expect(result[0]).toBe(error);
    });
  });

  describe('comparison with fromArray', () => {
    it('should emit single value unlike fromArray with one element', async () => {
      const fromValueSource = fromValue([1, 2, 3]);
      const fromArraySource = fromValue([1, 2, 3]);

      const fromValueResult = await collectAll(fromValueSource);
      const fromArrayResult = await collectAll(fromArraySource);

      expect(fromValueResult).toEqual([[1, 2, 3]]);
      expect(fromArrayResult).toEqual([[1, 2, 3]]);
    });
  });
});
