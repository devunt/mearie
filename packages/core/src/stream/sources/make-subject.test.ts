import { describe, it, expect } from 'vitest';
import { makeSubject } from './make-subject.ts';
import { pipe } from '../pipe.ts';
import { collectAll } from '../sinks/collect-all.ts';

describe('makeSubject', () => {
  it('should emit pushed values to subscribers', async () => {
    const subject = makeSubject<number>();
    const promise = pipe(subject.source, collectAll);

    subject.next(1);
    subject.next(2);
    subject.next(3);
    subject.complete();

    expect(await promise).toEqual([1, 2, 3]);
  });

  it('should support multiple subscribers', async () => {
    const subject = makeSubject<number>();
    const promise1 = pipe(subject.source, collectAll);
    const promise2 = pipe(subject.source, collectAll);

    subject.next(1);
    subject.next(2);
    subject.complete();

    expect(await promise1).toEqual([1, 2]);
    expect(await promise2).toEqual([1, 2]);
  });
});
