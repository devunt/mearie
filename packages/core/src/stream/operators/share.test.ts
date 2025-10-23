import { describe, it, expect } from 'vitest';
import { share } from './share.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { pipe } from '../pipe.ts';
import { map } from './map.ts';
import type { Source } from '../types.ts';

describe('share', () => {
  describe('basic multicast behavior', () => {
    it('should share source across multiple subscribers', async () => {
      let sourceExecutions = 0;

      const source: Source<number> = (sink) => {
        sourceExecutions++;
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.next(1);
        sink.next(2);
        sink.next(3);
        sink.complete();
      };

      const shared = pipe(source, share());

      const values1: number[] = [];
      const values2: number[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values1.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values2.push(v),
            complete: () => resolve(),
          });
        }),
      ]);

      expect(sourceExecutions).toBe(1);
      expect(values1).toEqual([1, 2, 3]);
      expect(values2).toEqual([1, 2, 3]);
    });

    it('should execute source only once for multiple subscribers', async () => {
      const source = fromArray([1, 2, 3]);
      let startCalled = 0;

      const trackedSource: Source<number> = (sink) => {
        source({
          start: (tb) => {
            startCalled++;
            sink.start(tb);
          },
          next: (value) => sink.next(value),
          complete: () => sink.complete(),
        });
      };

      const shared = pipe(trackedSource, share());

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
      ]);

      expect(startCalled).toBe(1);
    });
  });

  describe('deferred execution', () => {
    it('should start source execution synchronously but defer value delivery', () => {
      let sourceExecuted = false;
      let valueDelivered = false;

      const source: Source<number> = (sink) => {
        sourceExecuted = true;
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.next(1);
        sink.complete();
      };

      const shared = pipe(source, share());

      shared({
        start: () => {},
        next: () => {
          valueDelivered = true;
        },
        complete: () => {},
      });

      expect(sourceExecuted).toBe(true);
      expect(valueDelivered).toBe(false);
    });

    it('should deliver completion after setTimeout', async () => {
      let valueDelivered = false;
      let completed = false;

      const source: Source<number> = (sink) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.next(1);
        sink.complete();
      };

      const shared = pipe(source, share());

      const promise = new Promise<void>((resolve) => {
        shared({
          start: () => {},
          next: () => {
            valueDelivered = true;
          },
          complete: () => {
            completed = true;
            resolve();
          },
        });
      });

      await promise;

      expect(valueDelivered).toBe(true);
      expect(completed).toBe(true);
    });
  });

  describe('value distribution', () => {
    it('should send same values to all subscribers', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const shared = pipe(source, share());

      const values1: number[] = [];
      const values2: number[] = [];
      const values3: number[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values1.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values2.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values3.push(v),
            complete: () => resolve(),
          });
        }),
      ]);

      expect(values1).toEqual([1, 2, 3, 4, 5]);
      expect(values2).toEqual([1, 2, 3, 4, 5]);
      expect(values3).toEqual([1, 2, 3, 4, 5]);
    });

    it('should send single value to all subscribers', async () => {
      const source = fromValue(42);
      const shared = pipe(source, share());

      const values1: number[] = [];
      const values2: number[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values1.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values2.push(v),
            complete: () => resolve(),
          });
        }),
      ]);

      expect(values1).toEqual([42]);
      expect(values2).toEqual([42]);
    });
  });

  describe('completion', () => {
    it('should notify all subscribers of completion', async () => {
      const source = fromArray([1, 2, 3]);
      const shared = pipe(source, share());

      let completed1 = false;
      let completed2 = false;
      let completed3 = false;

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => {
              completed1 = true;
              resolve();
            },
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => {
              completed2 = true;
              resolve();
            },
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => {
              completed3 = true;
              resolve();
            },
          });
        }),
      ]);

      expect(completed1).toBe(true);
      expect(completed2).toBe(true);
      expect(completed3).toBe(true);
    });

    it('should clear subscribers after completion', async () => {
      const source = fromArray([1, 2, 3]);
      const shared = pipe(source, share());

      await new Promise<void>((resolve) => {
        shared({
          start: () => {},
          next: () => {},
          complete: () => resolve(),
        });
      });
    });
  });

  describe('with operators', () => {
    it('should work with map before share', async () => {
      const source = fromArray([1, 2, 3]);
      const shared = pipe(
        source,
        map((x) => x * 2),
        share(),
      );

      const values1: number[] = [];
      const values2: number[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values1.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values2.push(v),
            complete: () => resolve(),
          });
        }),
      ]);

      expect(values1).toEqual([2, 4, 6]);
      expect(values2).toEqual([2, 4, 6]);
    });

    it('should work with map after share', async () => {
      const source = fromArray([1, 2, 3]);
      const shared = pipe(
        source,
        share(),
        map((x) => x * 2),
      );

      const values1: number[] = [];
      const values2: number[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values1.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values2.push(v),
            complete: () => resolve(),
          });
        }),
      ]);

      expect(values1).toEqual([2, 4, 6]);
      expect(values2).toEqual([2, 4, 6]);
    });
  });

  describe('talkback', () => {
    it('should provide talkback to subscribers', async () => {
      const source = fromArray([1, 2, 3]);
      const shared = pipe(source, share());

      let talkback1Received = false;
      let talkback2Received = false;

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: (tb) => {
              talkback1Received = !!tb;
            },
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: (tb) => {
              talkback2Received = !!tb;
            },
            next: () => {},
            complete: () => resolve(),
          });
        }),
      ]);

      expect(talkback1Received).toBe(true);
      expect(talkback2Received).toBe(true);
    });
  });

  describe('side effect isolation', () => {
    it('should execute side effects only once', async () => {
      let sideEffectCount = 0;

      const source: Source<number> = (sink) => {
        sideEffectCount++;
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.next(1);
        sink.complete();
      };

      const shared = pipe(source, share());

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
      ]);

      expect(sideEffectCount).toBe(1);
    });
  });

  describe('value types', () => {
    it('should share objects', async () => {
      const source = fromArray([{ id: 1 }, { id: 2 }]);
      const shared = pipe(source, share());

      const values1: { id: number }[] = [];
      const values2: { id: number }[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values1.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values2.push(v),
            complete: () => resolve(),
          });
        }),
      ]);

      expect(values1).toEqual([{ id: 1 }, { id: 2 }]);
      expect(values2).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should share arrays', async () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);
      const shared = pipe(source, share());

      const values1: number[][] = [];
      const values2: number[][] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values1.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => values2.push(v),
            complete: () => resolve(),
          });
        }),
      ]);

      expect(values1).toEqual([
        [1, 2],
        [3, 4],
      ]);
      expect(values2).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('use cases', () => {
    it('should be useful for deduplication', async () => {
      let apiCalls = 0;

      const apiCall: Source<string> = (sink) => {
        apiCalls++;
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        setTimeout(() => {
          sink.next('data');
          sink.complete();
        }, 10);
      };

      const shared = pipe(apiCall, share());

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: () => {},
            complete: () => resolve(),
          });
        }),
      ]);

      expect(apiCalls).toBe(1);
    });

    it('should be useful for expensive computations', async () => {
      let computations = 0;

      const expensiveComputation: Source<number> = (sink) => {
        computations++;
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        const result = Array.from({ length: 1000 }, (_, i) => i).reduce((a, b) => a + b, 0);
        sink.next(result);
        sink.complete();
      };

      const shared = pipe(expensiveComputation, share());

      const results: number[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => results.push(v),
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            start: () => {},
            next: (v) => results.push(v),
            complete: () => resolve(),
          });
        }),
      ]);

      expect(computations).toBe(1);
      expect(results[0]).toBe(results[1]);
    });
  });
});
