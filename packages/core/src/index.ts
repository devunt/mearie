/**
 * Core runtime for Mearie GraphQL client.
 */

export type {
  Artifact,
  ArtifactKind,
  Argument,
  DataOf,
  FragmentRefs,
  List,
  MaybePromise,
  Nullable,
  Opaque,
  Selection,
  VariablesOf,
} from '@mearie/shared';
export type { EntityMeta, Operation, SchemaMeta } from './types.ts';
export { combineHashes, hashString, stableStringify } from './utils.ts';
export { executeLinks, type GraphQLError, type Link, type LinkContext, type LinkResult, type NextFn } from './link.ts';
export { dedupLink } from './links/dedup.ts';
export { retryLink, type RetryOptions } from './links/retry.ts';
export { httpLink, type HttpOptions } from './links/fetch.ts';
export { authLink, type AuthOptions } from './links/auth.ts';
export { cacheLink, type CacheLink, type CacheOptions } from './links/cache.ts';
export { Cache, type CacheListener } from './cache/cache.ts';
export { FragmentRefKey } from './cache/constants.ts';
export { Client, createClient, type ClientConfig, type MutationOptions, type QueryOptions } from './client.ts';
