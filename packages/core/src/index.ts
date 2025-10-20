/**
 * Core utilities for Mearie GraphQL client.
 */

export { MearieAggregateError, MearieError } from './errors.ts';
export type {
  DataOf,
  VariablesOf,
  Opaque,
  Source,
  Operation,
  Artifact,
  MaybePromise,
  FragmentRefs,
  Nullable,
  List,
} from './types.ts';
export { stableStringify, hashString, combineHashes } from './utils.ts';
export { logger, report } from './logger.ts';
export { executeLinks, type Link, type LinkContext, type LinkResult, type NextFn, type GraphQLError } from './link.ts';
export { dedupLink } from './links/dedup.ts';
export { retryLink, type RetryOptions } from './links/retry.ts';
export { httpLink, type HttpOptions } from './links/fetch.ts';
export { authLink, type AuthOptions } from './links/auth.ts';
export { cacheLink, type CacheOptions } from './links/cache.ts';
export { Cache, type CacheListener } from './cache/cache.ts';
export { Client, createClient, type ClientConfig, type QueryOptions, type MutationOptions } from './client.ts';
