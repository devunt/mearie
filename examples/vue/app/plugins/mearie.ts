import {
  createClient,
  dedupExchange,
  cacheExchange,
  retryExchange,
  httpExchange,
  subscriptionExchange,
  ClientPlugin,
} from '@mearie/vue';
import { createClient as createSSEClient } from 'graphql-sse';
import { schema } from '$mearie';

const mearieClient = createClient({
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
  scalars: {
    DateTime: {
      parse: (value) => new Date(value as string),
      serialize: (value) => value.toISOString(),
    },
    URL: {
      parse: (value) => value as string,
      serialize: (value) => value,
    },
  },
});

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(ClientPlugin, { client: mearieClient });
});
