import { describe, expect, it, vi } from 'vitest';
import { peek } from './peek.ts';
import { fromValue } from '../sources/from-value.ts';
import { fromArray } from '../sources/from-array.ts';
import { pipe } from '../pipe.ts';

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
    const asyncSource = (sink: any) => {
      sink.start({
        pull: () => {},
        cancel: () => {},
      });
      setTimeout(() => {
        sink.next(42);
      }, 10);
    };

    expect(() => peek(asyncSource)).toThrow('Source did not emit a value synchronously');
  });

  it('cancels subscription after reading first value', () => {
    const cancelSpy = vi.fn();
    const source = (sink: any) => {
      sink.start({
        pull: () => {},
        cancel: cancelSpy,
      });
      sink.next(100);
    };

    const result = peek(source);
    expect(result).toBe(100);
    expect(cancelSpy).toHaveBeenCalledOnce();
  });
});
