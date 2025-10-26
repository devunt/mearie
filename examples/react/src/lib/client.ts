import {
  createClient,
  dedupExchange,
  cacheExchange,
  retryExchange,
  httpExchange,
  subscriptionExchange,
} from '@mearie/react';
import { createClient as createSSEClient } from 'graphql-sse';
import { schema } from '~graphql';

export const mearieClient = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    retryExchange(),
    cacheExchange(),
    httpExchange({
      url: 'https://api.mearie.dev/graphql',
    }),
    subscriptionExchange({
      client: createSSEClient({
        url: 'https://api.mearie.dev/graphql',
      }),
    }),
  ],
});
