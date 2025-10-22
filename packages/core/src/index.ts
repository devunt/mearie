/**
 * Core runtime for Mearie GraphQL client.
 */

export type { Artifact, ArtifactKind, DataOf, FragmentRefs, VariablesOf } from '@mearie/shared';

export type { Exchange, ExchangeIO, Operation, OperationResult, OperationMetadataMap } from './exchange.ts';
export { makeOperation } from './exchange.ts';
export type { ExchangeErrorExtensionsMap, OperationError } from './errors.ts';
export {
  GraphQLError,
  ExchangeError,
  AggregatedError,
  isGraphQLError,
  isExchangeError,
  isAggregatedError,
} from './errors.ts';
export { composeExchange, type ComposeExchangeOptions } from './exchanges/compose.ts';

export { httpExchange, type HttpOptions } from './exchanges/http.ts';
export { dedupExchange } from './exchanges/dedup.ts';
export { cacheExchange, type CacheExchange, type CacheOptions } from './exchanges/cache.ts';
export { retryExchange, type RetryOptions } from './exchanges/retry.ts';

export {
  Client,
  createClient,
  type ClientOptions,
  type QueryOptions,
  type MutationOptions,
  type SubscriptionOptions,
} from './client.ts';

export { Cache } from './cache/cache.ts';

export { stringify } from './utils.ts';
