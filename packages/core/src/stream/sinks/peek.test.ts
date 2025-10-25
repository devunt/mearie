import { describe, expect, it, vi } from 'vitest';
import { peek } from './peek.ts';
import { fromValue } from '../sources/from-value.ts';
import { fromArray } from '../sources/from-array.ts';
import { pipe } from '../pipe.ts';
import type { Sink } from '../types.ts';

describe('peek', () => {
  it('synchronously pulls the first value from a source', () => {
    const source = fromValue(42);
    const result = peek(source);
    expect(result).toBe(42);
  });

  it('pulls the first value from an array source', () => {
    const source = fromArray([1, 2, 3]);
    const result = peek(source);
    expect(result).toBe(1);
  });

  it('can be used with pipe', () => {
    const result = pipe(fromValue('hello'), peek);
    expect(result).toBe('hello');
  });

  it('throws if source does not emit synchronously', () => {
    const asyncSource = (sink: Sink<number>) => {
      setTimeout(() => {
        sink.next(42);
      }, 0);
      return {
        unsubscribe: () => {},
      };
    };

    expect(() => peek(asyncSource)).toThrow('Source did not emit a value synchronously');
  });

  it('cancels subscription after reading first value', () => {
    const unsubscribe = vi.fn();
    const source = (sink: Sink<number>) => {
      sink.next(100);
      return {
        unsubscribe,
      };
    };

    const result = peek(source);
    expect(result).toBe(100);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
