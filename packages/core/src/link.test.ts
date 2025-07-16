import { describe, it, expect } from 'vitest';
import { executeLinks, type Link, type LinkContext } from './link.ts';

describe('executeLinks', () => {
  it('should execute links in order', async () => {
    const order: string[] = [];

    const link1: Link = {
      name: 'link1',
      async execute(ctx, next) {
        order.push('link1-before');
        const result = await next();
        order.push('link1-after');
        return result;
      },
    };

    const link2: Link = {
      name: 'link2',
      async execute(ctx, next) {
        order.push('link2-before');
        const result = await next();
        order.push('link2-after');
        return result;
      },
    };

    const ctx: LinkContext = {
      operation: {
        kind: 'query',
        document: {
          body: 'test',
          kind: 'query',
          hash: 0,
          selections: [],
        },
      },
      metadata: new Map(),
    };

    await executeLinks([link1, link2], ctx, () => {
      order.push('final');
      return { data: 'result' };
    });

    expect(order).toEqual(['link1-before', 'link2-before', 'final', 'link2-after', 'link1-after']);
  });

  it('should pass result through link chain', async () => {
    const link1: Link = {
      name: 'link1',
      async execute(ctx, next) {
        const result = await next();
        return { ...result, modified: true };
      },
    };

    const ctx: LinkContext = {
      operation: {
        kind: 'query',
        document: {
          body: 'test',
          kind: 'query',
          hash: 0,
          selections: [],
        },
      },
      metadata: new Map(),
    };

    const result = await executeLinks([link1], ctx, () => {
      return { data: 'original' };
    });

    expect(result).toEqual({ data: 'original', modified: true });
  });
});
