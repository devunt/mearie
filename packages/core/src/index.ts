/**
 * Core runtime for Mearie GraphQL client.
 */

export type { Artifact, ArtifactKind, DataOf, FragmentRefs, VariablesOf, SchemaMeta } from '@mearie/shared';

export type {
  Exchange,
  ExchangeExtensionMap,
  ExchangeIO,
  ExchangeResult,
  Operation,
  OperationResult,
  OperationMetadata,
  OperationMetadataMap,
} from './exchange.ts';
export type { ExchangeErrorExtensionsMap, OperationError } from './errors.ts';
export {
  GraphQLError,
  ExchangeError,
  AggregatedError,
  isGraphQLError,
  isExchangeError,
  isAggregatedError,
} from './errors.ts';

export { httpExchange, type HttpOptions } from './exchanges/http.ts';
export { dedupExchange } from './exchanges/dedup.ts';
export { cacheExchange, type CacheOptions } from './exchanges/cache.ts';
export type { CacheSnapshot } from './cache/types.ts';
export { retryExchange, type RetryOptions } from './exchanges/retry.ts';
export { fragmentExchange } from './exchanges/fragment.ts';
export { requiredExchange } from './exchanges/required.ts';
export {
  subscriptionExchange,
  type SubscriptionExchangeOptions,
  type SubscriptionClient,
} from './exchanges/subscription.ts';

export { RequiredFieldError, type RequiredAction } from './required.ts';

export {
  Client,
  createClient,
  type ClientOptions,
  type QueryOptions,
  type MutationOptions,
  type SubscriptionOptions,
  type FragmentOptions,
} from './client.ts';

export { stringify } from './utils.ts';
