/**
 * Core runtime for Mearie GraphQL client.
 */

export type { Artifact, ArtifactKind, DataOf, FragmentRefs, VariablesOf } from '@mearie/shared';
export { type Link, type LinkContext, type LinkResult, type NextFn } from './link.ts';
export { dedupLink } from './links/dedup.ts';
export { retryLink, type RetryOptions } from './links/retry.ts';
export { httpLink, type HttpOptions } from './links/fetch.ts';
export { cacheLink, type CacheLink, type CacheOptions } from './links/cache.ts';
export { Client, createClient, type ClientOptions } from './client.ts';
