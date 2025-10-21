import type { Link, LinkContext, NextFn, LinkResult } from '../link.ts';
import type { Cache } from '../cache/cache.ts';

export type CacheOptions = {
  cache: Cache;
  fetchPolicy?: 'cache-first' | 'cache-and-network' | 'network-only' | 'cache-only';
};

/**
 * @param options - The cache options.
 * @returns The cache link.
 */
const createCacheLink = (options: CacheOptions): Link => {
  const { cache, fetchPolicy = 'cache-first' } = options;

  return {
    name: 'cache',

    async execute(ctx: LinkContext, next: NextFn): Promise<LinkResult> {
      const { artifact, variables, kind } = ctx.operation;

      if (kind === 'mutation' || kind === 'subscription') {
        const result = await next();

        if (kind === 'mutation' && result.data) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          cache.writeQuery(artifact, variables ?? ({} as any), result.data);
        }

        return result;
      }

      if (fetchPolicy === 'network-only') {
        const result = await next();
        if (result.data) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          cache.writeQuery(artifact, variables ?? ({} as any), result.data);
        }
        return result;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const cached = cache.readQuery(artifact, variables ?? ({} as any));

      if (fetchPolicy === 'cache-only') {
        return { data: cached ?? undefined };
      }

      if (fetchPolicy === 'cache-first' && cached) {
        return { data: cached };
      }

      const result = await next();

      if (result.data) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        cache.writeQuery(artifact, variables ?? ({} as any), result.data);
      }

      return result;
    },
  };
};

export const cacheLink = createCacheLink;
