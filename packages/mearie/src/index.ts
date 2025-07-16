/**
 * Mearie GraphQL Client - Main Package
 * Re-exports all core functionality for convenience.
 */

// Re-export codegen results from @mearie/client
export * from '@mearie/client';

// Re-export core functionality
export {
  // Core
  type DocumentNode,

  // Client
  Client,
  createClient,
  type ClientConfig,
  type QueryOptions,
  type MutationOptions,

  // Types
  type SelectionNode,
  type ArgumentValue,
  type SchemaMetadata,
  type EntityInfo,
  type Operation,

  // Utils
  stableStringify,
  hashString,
  combineHashes,

  // Link System
  executeLinks,
  type Link,
  type LinkContext,
  type LinkResult,
  type NextFn,
  type GraphQLError,

  // Built-in Links
  dedupLink,
  retryLink,
  type RetryOptions,
  httpLink,
  type HttpOptions,
  authLink,
  type AuthOptions,
  cacheLink,
  type CacheOptions,

  // Cache
  NormalizedCache,
  type CacheListener,

  // Errors
  MearieError,
  MearieAggregateError,

  // Logger
  logger,
  report,
} from '@mearie/core';
