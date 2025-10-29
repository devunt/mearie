import { describe, it, expect, vi } from 'vitest';
import { switchMap } from './switch-map.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { makeSubject } from '../sources/make-subject.ts';
import { make } from '../sources/make.ts';

describe('switchMap', () => {
  describe('basic functionality', () => {
    it('should map each value to a source and flatten', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        switchMap((x) => fromArray([x, x * 2])),
        collectAll,
      );

      expect(result.toSorted()).toEqual([1, 2, 2, 3, 4, 6]);
    });

    it('should handle single value source', async () => {
      const source = fromValue(5);

      const result = await pipe(
        source,
        switchMap((x) => fromArray([x, x + 1, x + 2])),
        collectAll,
      );

      expect(result).toEqual([5, 6, 7]);
    });

    it('should handle empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(
        source,
        switchMap((x) => fromArray([x, x * 2])),
        collectAll,
      );

      expect(result).toEqual([]);
    });
  });

  describe('switching behavior', () => {
    it('should cancel previous inner subscription when new value arrives', () => {
      const subject = makeSubject<number>();
      const unsubscribeSpy = vi.fn();

      const results: number[] = [];

      pipe(
        subject.source,
        switchMap((x) =>
          make<number>((observer) => {
            observer.next(x);
            observer.next(x * 10);
            observer.complete();
            return unsubscribeSpy;
          }),
        ),
      )({
        next: (value) => results.push(value),
        complete: () => {},
      });

      subject.next(1);
      expect(results).toEqual([1, 10]);
      expect(unsubscribeSpy).not.toHaveBeenCalled();

      subject.next(2);
      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
      expect(results).toEqual([1, 10, 2, 20]);

      subject.complete();
    });

    it('should only emit values from the latest inner source', () => {
      const subject = makeSubject<string>();
      const results: string[] = [];

      pipe(
        subject.source,
        switchMap((x) => fromArray([x, x + x])),
      )({
        next: (value) => results.push(value),
        complete: () => {},
      });

      subject.next('a');
      subject.next('b');
      subject.next('c');
      subject.complete();

      expect(results).toEqual(['a', 'aa', 'b', 'bb', 'c', 'cc']);
    });

    it('should unsubscribe from previous inner source before subscribing to new one', () => {
      const subject = makeSubject<number>();
      const unsubscribeCalls: number[] = [];

      pipe(
        subject.source,
        switchMap((x) =>
          make((observer) => {
            observer.next(x);
            observer.complete();
            return () => {
              unsubscribeCalls.push(x);
            };
          }),
        ),
      )({
        next: () => {},
        complete: () => {},
      });

      subject.next(1);
      subject.next(2);
      subject.next(3);

      expect(unsubscribeCalls).toEqual([1, 2]);
    });
  });

  describe('completion', () => {
    it('should complete when outer source completes and inner source completes', () => {
      const source = fromArray([1, 2, 3]);

      let completed = false;

      pipe(
        source,
        switchMap((x) => fromValue(x)),
      )({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should complete immediately on empty source', () => {
      const source = fromArray<number>([]);

      let completed = false;

      pipe(
        source,
        switchMap((x) => fromValue(x)),
      )({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should wait for latest inner source to complete before completing', () => {
      const subject = makeSubject<number>();
      let completed = false;

      pipe(
        subject.source,
        switchMap((x) => fromArray([x, x * 2])),
      )({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      subject.next(1);
      expect(completed).toBe(false);

      subject.next(2);
      expect(completed).toBe(false);

      subject.complete();
      expect(completed).toBe(true);
    });
  });

  describe('unsubscription', () => {
    it('should unsubscribe from outer and inner sources', () => {
      const subject = makeSubject<number>();
      const innerUnsubscribe = vi.fn();

      const subscription = pipe(
        subject.source,
        switchMap(() =>
          make((observer) => {
            observer.next(1);
            observer.complete();
            return innerUnsubscribe;
          }),
        ),
      )({
        next: () => {},
        complete: () => {},
      });

      subject.next(1);
      expect(innerUnsubscribe).not.toHaveBeenCalled();

      subscription.unsubscribe();
      expect(innerUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should handle unsubscription with no active inner source', () => {
      const subject = makeSubject<number>();

      const subscription = pipe(
        subject.source,
        switchMap((x) => fromValue(x)),
      )({
        next: () => {},
        complete: () => {},
      });

      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('type transformation', () => {
    it('should transform types through inner sources', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        switchMap((x) => fromValue(String(x))),
        collectAll,
      );

      expect(result.toSorted()).toEqual(['1', '2', '3']);
    });
  });

  describe('use case: re-subscription pattern', () => {
    it('should enable re-subscription on signal', () => {
      const trigger = makeSubject<void>();
      let pullCount = 0;

      const pull = () => {
        pullCount++;
        return `value-${pullCount}`;
      };

      const results: string[] = [];

      pipe(
        trigger.source,
        switchMap(() => fromValue(pull())),
      )({
        next: (value) => results.push(value),
        complete: () => {},
      });

      trigger.next();
      expect(results).toEqual(['value-1']);

      trigger.next();
      expect(results).toEqual(['value-1', 'value-2']);

      trigger.next();
      expect(results).toEqual(['value-1', 'value-2', 'value-3']);
    });
  });
});
