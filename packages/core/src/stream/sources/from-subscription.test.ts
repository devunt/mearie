import { describe, it, expect, vi } from 'vitest';
import { fromSubscription } from './from-subscription.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import type { Talkback } from '../types.ts';

describe('fromSubscription', () => {
  describe('basic functionality', () => {
    it('should emit initial value immediately', () => {
      let state = 1;
      const pull = () => state;
      const poke = () => () => {};

      const source = fromSubscription(pull, poke);
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

    it('should emit new values when signal is called', () => {
      let state = 1;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: number[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([1]);

      state = 2;
      signal!();
      expect(emitted).toEqual([1, 2]);

      state = 3;
      signal!();
      expect(emitted).toEqual([1, 2, 3]);
    });

    it('should call unsubscribe on cancel', () => {
      let state = 1;
      const pull = () => state;
      const unsubscribe = vi.fn();
      const poke = () => unsubscribe;

      const source = fromSubscription(pull, poke);
      let talkback: Talkback;

      source({
        start: (tb) => {
          talkback = tb;
        },
        next: () => {},
        complete: () => {},
      });

      expect(unsubscribe).not.toHaveBeenCalled();

      talkback.cancel();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should pull latest value on signal', () => {
      let state = 10;
      const pull = vi.fn(() => state);
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: number[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(pull).toHaveBeenCalledTimes(1);

      state = 20;
      signal!();

      expect(pull).toHaveBeenCalledTimes(2);
      expect(emitted).toEqual([10, 20]);
    });
  });

  describe('cancellation', () => {
    it('should not emit if cancelled before subscription', () => {
      let state = 1;
      const pull = () => state;
      const poke = () => () => {};

      const source = fromSubscription(pull, poke);
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

    it('should not emit after cancellation', () => {
      let state = 1;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
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

      expect(emitted).toEqual([1]);

      talkback.cancel();

      state = 2;
      signal!();

      expect(emitted).toEqual([1]);
    });

    it('should not setup poke if cancelled after initial value', () => {
      let state = 1;
      const pull = () => state;
      const poke = vi.fn(() => () => {});

      const source = fromSubscription(pull, poke);
      let cancelled = false;

      source({
        start: (tb) => {
          tb.cancel();
          cancelled = true;
        },
        next: () => {
          if (cancelled) {
            throw new Error('Should not emit after cancellation');
          }
        },
        complete: () => {},
      });

      expect(poke).not.toHaveBeenCalled();
    });

    it('should call unsubscribe only once', () => {
      let state = 1;
      const pull = () => state;
      const unsubscribe = vi.fn();
      const poke = () => unsubscribe;

      const source = fromSubscription(pull, poke);
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

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('value types', () => {
    it('should handle string values', () => {
      let state = 'initial';
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: string[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = 'updated';
      signal!();

      expect(emitted).toEqual(['initial', 'updated']);
    });

    it('should handle object values', () => {
      let state = { count: 1 };
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: { count: number }[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = { count: 2 };
      signal!();

      expect(emitted).toEqual([{ count: 1 }, { count: 2 }]);
    });

    it('should handle array values', () => {
      let state = [1, 2, 3];
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: number[][] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = [4, 5, 6];
      signal!();

      expect(emitted).toEqual([
        [1, 2, 3],
        [4, 5, 6],
      ]);
    });
  });

  describe('falsy values', () => {
    it('should emit null values', () => {
      let state: number | null = null;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: (number | null)[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = 1;
      signal!();

      state = null;
      signal!();

      expect(emitted).toEqual([null, 1, null]);
    });

    it('should emit undefined values', () => {
      let state: number | undefined = undefined;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: (number | undefined)[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = 1;
      signal!();

      expect(emitted).toEqual([undefined, 1]);
    });

    it('should emit zero', () => {
      let state = 0;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: number[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = 1;
      signal!();

      state = 0;
      signal!();

      expect(emitted).toEqual([0, 1, 0]);
    });

    it('should emit false', () => {
      let state = false;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: boolean[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = true;
      signal!();

      state = false;
      signal!();

      expect(emitted).toEqual([false, true, false]);
    });

    it('should emit empty string', () => {
      let state = '';
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: string[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = 'a';
      signal!();

      state = '';
      signal!();

      expect(emitted).toEqual(['', 'a', '']);
    });
  });

  describe('with operators', () => {
    it('should work with map', async () => {
      let state = 1;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);

      const promise = new Promise<number[]>((resolve) => {
        const emitted: number[] = [];
        pipe(
          source,
          map((x) => x * 2),
        )({
          start: () => {},
          next: (value) => {
            emitted.push(value);
            if (emitted.length === 3) {
              resolve(emitted);
            }
          },
          complete: () => {},
        });

        state = 2;
        signal!();

        state = 3;
        signal!();
      });

      const result = await promise;
      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('talkback', () => {
    it('should provide talkback', () => {
      let state = 1;
      const pull = () => state;
      const poke = () => () => {};

      const source = fromSubscription(pull, poke);
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
      let state = 1;
      const pull = () => state;
      const poke = () => () => {};

      const source = fromSubscription(pull, poke);

      source({
        start: (tb) => {
          expect(() => tb.pull()).not.toThrow();
        },
        next: () => {},
        complete: () => {},
      });
    });
  });

  describe('multiple signals', () => {
    it('should handle multiple rapid signals', () => {
      let state = 0;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: number[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      for (let i = 1; i <= 10; i++) {
        state = i;
        signal!();
      }

      expect(emitted).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should handle signal without state change', () => {
      let state = 1;
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: number[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      signal!();
      signal!();

      expect(emitted).toEqual([1, 1, 1]);
    });
  });

  describe('edge cases', () => {
    it('should handle unsubscribe returning undefined', () => {
      let state = 1;
      const pull = () => state;
      const poke = () => undefined as unknown as () => void;

      const source = fromSubscription(pull, poke);
      let talkback: Talkback;

      source({
        start: (tb) => {
          talkback = tb;
        },
        next: () => {},
        complete: () => {},
      });

      expect(() => talkback.cancel()).not.toThrow();
    });

    it('should handle complex state objects', () => {
      let state = { users: [{ id: 1, name: 'Alice' }], count: 1 };
      const pull = () => state;
      let signal: (() => void) | null = null;
      const poke = (s: () => void) => {
        signal = s;
        return () => {};
      };

      const source = fromSubscription(pull, poke);
      const emitted: typeof state[] = [];

      source({
        start: () => {},
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      state = { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], count: 2 };
      signal!();

      expect(emitted).toEqual([
        { users: [{ id: 1, name: 'Alice' }], count: 1 },
        { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], count: 2 },
      ]);
    });
  });
});
