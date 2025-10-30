export * from '@mearie/core';
export { setClient, getClient } from './client-context.svelte.ts';
export { createQuery, type Query, type CreateQueryOptions } from './create-query.svelte.ts';
export { createSubscription, type Subscription, type CreateSubscriptionOptions } from './create-subscription.svelte.ts';
export {
  createMutation,
  type Mutation,
  type MutationResult,
  type CreateMutationOptions,
} from './create-mutation.svelte.ts';
export { createFragment, type Fragment, type CreateFragmentOptions } from './create-fragment.svelte.ts';
