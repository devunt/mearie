import type { Link, LinkContext, NextFn, LinkResult } from '../link.ts';
import { Cache } from '../cache/cache.ts';
import type { SchemaMeta } from '../types.ts';

export type CacheOptions = {
  schemaMeta?: SchemaMeta;
  fetchPolicy?: 'cache-first' | 'cache-and-network' | 'network-only' | 'cache-only';
};

export interface CacheLink extends Link {
  cache: Cache;
}

/**
 * @param options - The cache options.
 * @returns The cache link.
 */
const createCacheLink = (options: CacheOptions = {}): CacheLink => {
  const { schemaMeta = { entities: {} }, fetchPolicy = 'cache-first' } = options;
  const cache = new Cache(schemaMeta);

  return {
    name: 'cache',
    cache,

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
