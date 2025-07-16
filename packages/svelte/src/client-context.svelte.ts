import { getContext, setContext } from 'svelte';
import type { Client } from '@mearie/core';

const CLIENT_KEY = Symbol('mearie-client');

export const setClient = (client: Client): void => {
  setContext(CLIENT_KEY, client);
};

export const getClient = (): Client => {
  const client = getContext<Client>(CLIENT_KEY);

  if (!client) {
    throw new Error('getClient must be used within a context that has called setClient');
  }

  return client;
};
