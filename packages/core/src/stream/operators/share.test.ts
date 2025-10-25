import { describe, it, expect } from 'vitest';
import { share } from './share.ts';
import { fromArray } from '../sources/from-array.ts';
import { pipe } from '../pipe.ts';
import { map } from './map.ts';
import type { Source } from '../types.ts';
import { initialize } from './initialize.ts';
import { delay } from './delay.ts';
import { fromValue } from '../sources/from-value.ts';
import { lazy } from '../sources/lazy.ts';

describe('share', () => {
  describe('basic multicast behavior', () => {
    it('should share source across multiple subscribers', async () => {
      let sourceExecutions = 0;

      const source = fromArray([1, 2, 3]);
      const shared = pipe(
        source,
        initialize(() => sourceExecutions++),
        delay(0),
        share(),
      );

      const values1: number[] = [];
      const values2: number[] = [];

      const promise1 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values1.push(v),
          complete: () => resolve(),
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values2.push(v),
          complete: () => resolve(),
        });
      });

      await Promise.all([promise1, promise2]);

      expect(sourceExecutions).toBe(1);
      expect(values1).toEqual([1, 2, 3]);
      expect(values2).toEqual([1, 2, 3]);
    });

    it('should execute source only once for multiple subscribers', async () => {
      let sourceCalled = 0;
      const source = fromArray([1, 2, 3]);

      const shared = pipe(
        source,
        initialize(() => sourceCalled++),
        share(),
      );

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => resolve(),
          });
        }),
      ]);

      expect(sourceCalled).toBe(1);
    });
  });

  describe('synchronous execution', () => {
    it('should start source execution lazily on first subscription', () => {
      let sourceExecuted = false;

      const source: Source<number> = (sink) => {
        sourceExecuted = true;
        sink.next(1);
        sink.complete();
        return { unsubscribe: () => {} };
      };

      const shared = pipe(source, share());

      expect(sourceExecuted).toBe(false);

      shared({
        next: () => {},
        complete: () => {},
      });

      expect(sourceExecuted).toBe(true);
    });

    it('should deliver values and completion synchronously', () => {
      let valueDelivered = false;
      let completed = false;

      const source: Source<number> = (sink) => {
        sink.next(1);
        sink.complete();
        return { unsubscribe: () => {} };
      };

      const shared = pipe(source, share());

      shared({
        next: () => {
          valueDelivered = true;
        },
        complete: () => {
          completed = true;
        },
      });

      expect(valueDelivered).toBe(true);
      expect(completed).toBe(true);
    });
  });

  describe('value distribution', () => {
    it('should send same values to all subscribers', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const shared = pipe(source, delay(0), share());

      const values1: number[] = [];
      const values2: number[] = [];
      const values3: number[] = [];

      const promise1 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values1.push(v),
          complete: () => resolve(),
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values2.push(v),
          complete: () => resolve(),
        });
      });

      const promise3 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values3.push(v),
          complete: () => resolve(),
        });
      });

      await Promise.all([promise1, promise2, promise3]);

      expect(values1).toEqual([1, 2, 3, 4, 5]);
      expect(values2).toEqual([1, 2, 3, 4, 5]);
      expect(values3).toEqual([1, 2, 3, 4, 5]);
    });

    it('should send single value to all subscribers', async () => {
      const source: Source<number> = (sink) => {
        setTimeout(() => {
          sink.next(42);
          sink.complete();
        }, 10);
        return { unsubscribe: () => {} };
      };

      const shared = pipe(source, share());

      const values1: number[] = [];
      const values2: number[] = [];

      const promise1 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values1.push(v),
          complete: () => resolve(),
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values2.push(v),
          complete: () => resolve(),
        });
      });

      await Promise.all([promise1, promise2]);

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
            next: () => {},
            complete: () => {
              completed1 = true;
              resolve();
            },
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => {
              completed2 = true;
              resolve();
            },
          });
        }),
        new Promise<void>((resolve) => {
          shared({
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
        delay(0),
        share(),
      );

      const values1: number[] = [];
      const values2: number[] = [];

      const promise1 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values1.push(v),
          complete: () => resolve(),
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values2.push(v),
          complete: () => resolve(),
        });
      });

      await Promise.all([promise1, promise2]);

      expect(values1).toEqual([2, 4, 6]);
      expect(values2).toEqual([2, 4, 6]);
    });

    it('should work with map after share', async () => {
      const source = fromArray([1, 2, 3]);
      const shared = pipe(
        source,
        delay(0),
        share(),
        map((x) => x * 2),
      );

      const values1: number[] = [];
      const values2: number[] = [];

      const promise1 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values1.push(v),
          complete: () => resolve(),
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values2.push(v),
          complete: () => resolve(),
        });
      });

      await Promise.all([promise1, promise2]);

      expect(values1).toEqual([2, 4, 6]);
      expect(values2).toEqual([2, 4, 6]);
    });
  });

  describe('subscription', () => {
    it('should provide subscription to subscribers', async () => {
      const source = fromArray([1, 2, 3]);
      const shared = pipe(source, share());

      let subscription1Received = false;
      let subscription2Received = false;

      await Promise.all([
        new Promise<void>((resolve) => {
          const sub = shared({
            next: () => {},
            complete: () => resolve(),
          });
          subscription1Received = !!sub;
        }),
        new Promise<void>((resolve) => {
          const sub = shared({
            next: () => {},
            complete: () => resolve(),
          });
          subscription2Received = !!sub;
        }),
      ]);

      expect(subscription1Received).toBe(true);
      expect(subscription2Received).toBe(true);
    });
  });

  describe('side effect isolation', () => {
    it('should execute side effects only once', async () => {
      let sideEffectCount = 0;

      const source: Source<number> = (sink) => {
        sideEffectCount++;
        sink.next(1);
        sink.complete();
        return { unsubscribe: () => {} };
      };

      const shared = pipe(source, share());

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
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
      const shared = pipe(source, delay(0), share());

      const values1: { id: number }[] = [];
      const values2: { id: number }[] = [];

      const promise1 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values1.push(v),
          complete: () => resolve(),
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values2.push(v),
          complete: () => resolve(),
        });
      });

      await Promise.all([promise1, promise2]);

      expect(values1).toEqual([{ id: 1 }, { id: 2 }]);
      expect(values2).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should share arrays', async () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);
      const shared = pipe(source, delay(0), share());

      const values1: number[][] = [];
      const values2: number[][] = [];

      const promise1 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values1.push(v),
          complete: () => resolve(),
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        shared({
          next: (v) => values2.push(v),
          complete: () => resolve(),
        });
      });

      await Promise.all([promise1, promise2]);

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

      const source = fromValue(0);
      const shared = pipe(
        source,
        initialize(() => apiCalls++),
        delay(0),
        share(),
      );

      await Promise.all([
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => resolve(),
          });
        }),
        new Promise<void>((resolve) => {
          shared({
            next: () => {},
            complete: () => resolve(),
          });
        }),
      ]);

      expect(apiCalls).toBe(1);
    });

    it('should be useful for expensive computations', async () => {
      let computations = 0;

      const source = lazy(() => {
        const result = Array.from({ length: 1000 }, (_, i) => i).reduce((a, b) => a + b, 0);
        computations++;
        return fromValue(result);
      });
      const shared = pipe(source, delay(0), share());

      const results1: number[] = [];
      const results2: number[] = [];

      const promise1 = new Promise<void>((resolve) => {
        shared({
          next: (v) => results1.push(v),
          complete: () => resolve(),
        });
      });

      const promise2 = new Promise<void>((resolve) => {
        shared({
          next: (v) => results2.push(v),
          complete: () => resolve(),
        });
      });

      await Promise.all([promise1, promise2]);

      expect(computations).toBe(1);
      expect(results1).toEqual(results2);
      expect(results1[0]).toBe(499_500);
    });
  });
});
