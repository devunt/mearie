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
      const { document, variables, kind } = ctx.operation;

      if (kind === 'mutation' || kind === 'subscription') {
        const result = await next();

        if (kind === 'mutation' && result.data) {
          cache.writeQuery(document, variables, result.data);
        }

        return result;
      }

      if (fetchPolicy === 'network-only') {
        const result = await next();
        if (result.data) {
          cache.writeQuery(document, variables, result.data);
        }
        return result;
      }

      const cached = cache.readQuery(document, variables);

      if (fetchPolicy === 'cache-only') {
        return { data: cached ?? undefined };
      }

      if (fetchPolicy === 'cache-first' && cached) {
        return { data: cached };
      }

      const result = await next();

      if (result.data) {
        cache.writeQuery(document, variables, result.data);
      }

      return result;
    },
  };
};

export const cacheLink = createCacheLink;
