import {
  createClient,
  dedupExchange,
  cacheExchange,
  retryExchange,
  httpExchange,
  subscriptionExchange,
} from '@mearie/react';
import { createClient as createSSEClient } from 'graphql-sse';

export const mearieClient = createClient({
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
