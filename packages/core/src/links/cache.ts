import type { Link, LinkContext, NextFn, LinkResult } from '../link.ts';
import { Cache } from '../cache/cache.ts';
import type { SchemaMeta, Artifact } from '@mearie/shared';

export type CacheOptions = {
  schemaMeta?: SchemaMeta;
  fetchPolicy?: 'cache-first' | 'cache-and-network' | 'network-only' | 'cache-only';
};

export type CacheLink = {
  cache: Cache;
} & Link;

/**
 * @param options - The cache options.
 * @returns The cache link.
 */
const createCacheLink = (options: CacheOptions = {}): CacheLink => {
  const { schemaMeta = { entities: {} }, fetchPolicy = 'cache-first' } = options;
  const cache = new Cache(schemaMeta);

  const fetchAndCache = async (
    artifact: Artifact,
    variables: Record<string, unknown>,
    next: NextFn,
  ): Promise<LinkResult> => {
    const result = await next();
    if (result.data) {
      cache.writeQuery(artifact, variables, result.data);
    }
    return result;
  };

  return {
    name: 'cache',
    cache,

    async execute(ctx: LinkContext, next: NextFn): Promise<LinkResult> {
      const { artifact, variables } = ctx.operation;

      if (artifact.kind !== 'query' || fetchPolicy === 'network-only') {
        return await fetchAndCache(artifact, variables, next);
      }

      const cached = cache.readQuery(artifact as Artifact<'query'>, variables);

      if (fetchPolicy === 'cache-only') {
        return { data: cached ?? undefined };
      }

      if (fetchPolicy === 'cache-first') {
        return cached ? { data: cached } : await fetchAndCache(artifact, variables, next);
      }

      if (cached) {
        void fetchAndCache(artifact, variables, next);
        return { data: cached };
      }

      return await fetchAndCache(artifact, variables, next);
    },
  };
};

export const cacheLink = createCacheLink;
